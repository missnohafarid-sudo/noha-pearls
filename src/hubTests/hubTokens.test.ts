import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDRESS_NEW_TOKENS } from '../ports/limits';
import { totpCode } from '../infrastructure/totp';
import { migrate } from '../infrastructure/sql/schema';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { STATUS_NETWORK_FULL } from '../ports/wire';
import { DeviceTokens } from '../server/DeviceTokens';
import { DEVICE_COOKIE } from '../server/identity';
import { randomToken } from '../server/webCrypto';
import { hub, jar, post, SECRETS, upgrade } from './requestsKit';

const NOW = () => 1_800_000_000_000;
const cookieOf = (response: Response) => response.headers.getSetCookie().find((line) => line.startsWith(`${DEVICE_COOKIE}=`))?.split(';')[0].slice(DEVICE_COOKIE.length + 1);

async function tokensOver(db = new NodeSqlDatabase(), now = NOW) {
  migrate(db);
  return DeviceTokens.from(db, now);
}

describe('a device token', () => {
  it('is a random part and a signature, which only the hub that issued it accepts', async () => {
    const devices = await tokensOver();
    const token = (await devices.issue('1.1.1.1'))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}\.[0-9a-f]{64}$/);
    expect(await devices.verified(token)).toBe(token);
    expect(await devices.issue('1.1.1.1')).not.toBe(token);
  });

  it('is refused when it is forged, cut short, extended, changed, or signed for another random part', async () => {
    const devices = await tokensOver();
    const [token, other] = [(await devices.issue('a'))!, (await devices.issue('a'))!];
    const [random, signature] = token.split('.');
    const forged = [
      `${randomToken()}.${'0'.repeat(64)}`,
      token.slice(0, -1),
      `${token}0`,
      `${random}.${signature.replace(/^./, signature[0] === 'a' ? 'b' : 'a')}`,
      `${other.split('.')[0]}.${signature}`,
      `${random}.${signature.toUpperCase()}`,
      random,
      randomToken(),
      '',
      `.${signature}`,
    ];
    for (const value of forged) expect(await devices.verified(value), value).toBeNull();
    expect(await devices.verified(undefined)).toBeNull();
  });

  it('is refused when it was signed with another key', async () => {
    const mine = await tokensOver();
    const theirs = await tokensOver();
    const alien = (await theirs.issue('a'))!;
    expect(await mine.verified(alien)).toBeNull();
    expect(await theirs.verified(alien)).toBe(alien);
  });

  it('is signed with a key made once and kept in the database, so that a restart keeps every device', async () => {
    const db = new NodeSqlDatabase();
    const first = await tokensOver(db);
    const token = (await first.issue('a'))!;
    expect(await (await tokensOver(db)).verified(token)).toBe(token);
    expect(await (await tokensOver()).verified(token)).toBeNull();
    expect(db.all('SELECT key FROM meta WHERE key = ?', 'device-token-key')).toHaveLength(1);
  });

  it('survives a change of the admin secrets and a restart of the hub, and is not a password oracle: the key owes nothing to the secrets', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'noha-pearls-tokens-'));
    try {
      const file = join(folder, 'hub.sqlite');
      const before = await hub(SECRETS, file);
      const token = cookieOf(await before.requests.handle(post('/api/hello')))!;
      const cookie = `${DEVICE_COOKIE}=${token}`;
      const after = await hub({ password: 'a-brand-new-password-7', totpSecret: 'JBSWY3DPEHPK3PXQ' }, file);
      expect((await after.requests.handle(upgrade({ Cookie: cookie }))).status).toBe(200);
      expect(await after.devices.verified(token)).toBe(token);
      const other = await hub(SECRETS);
      expect(await other.devices.verified(token)).toBeNull();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('is issued at most 1,500 an hour to one address, and the room comes back as the hour moves on', async () => {
    const clock = { now: NOW() };
    const devices = await tokensOver(new NodeSqlDatabase(), () => clock.now);
    for (let n = 0; n < ADDRESS_NEW_TOKENS.max; n += 1) expect(await devices.issue('9.9.9.9')).not.toBeNull();
    expect(await devices.issue('9.9.9.9')).toBeNull();
    expect(await devices.issue('9.9.9.8')).not.toBeNull();
    clock.now += ADDRESS_NEW_TOKENS.windowMs;
    expect(await devices.issue('9.9.9.9')).not.toBeNull();
  });

  it('still gives a fresh share to every address after the hour has passed and the hub has pruned its counts', async () => {
    const clock = { now: NOW() };
    const devices = await tokensOver(new NodeSqlDatabase(), () => clock.now);
    for (let n = 0; n < 50; n += 1) await devices.issue(`10.0.0.${n}`);
    clock.now += ADDRESS_NEW_TOKENS.windowMs;
    devices.prune();
    for (let n = 0; n < ADDRESS_NEW_TOKENS.max; n += 1) expect(await devices.issue('10.0.0.1')).not.toBeNull();
    expect(await devices.issue('10.0.0.1')).toBeNull();
  });

  it('is always given to the teacher, and never counted against the address', async () => {
    const devices = await tokensOver();
    for (let n = 0; n < ADDRESS_NEW_TOKENS.max; n += 1) await devices.issue('9.9.9.9');
    expect(await devices.issue('9.9.9.9')).toBeNull();
    expect(await devices.issue('9.9.9.9', true)).not.toBeNull();
  });
});

describe('the hello that gives a device its token', () => {
  it('gives a teacher on a new device her token even when the address has used up its new devices', async () => {
    const h = await hub();
    const school = { 'CF-Connecting-IP': '203.0.113.7' };
    for (let n = 0; n < ADDRESS_NEW_TOKENS.max; n += 1) await h.requests.handle(post('/api/hello', undefined, school));
    expect((await h.requests.handle(post('/api/hello', undefined, school))).status).toBe(STATUS_NETWORK_FULL);
    const code = await totpCode(SECRETS.totpSecret, h.harness.clock.now);
    const signedIn = await h.requests.handle(post('/api/sign-in', { password: SECRETS.password, code }, school));
    const adminCookie = jar(signedIn);
    const hello = await h.requests.handle(post('/api/hello', undefined, { ...school, Cookie: adminCookie }));
    expect(hello.status).toBe(200);
    expect(await hello.json()).toMatchObject({ admin: true });
    const deviceCookie = `${DEVICE_COOKIE}=${cookieOf(hello)}`;
    expect((await h.requests.handle(upgrade({ ...school, Cookie: `${adminCookie}; ${deviceCookie}` }))).status).toBe(200);
  });

  const hello = (h: Awaited<ReturnType<typeof hub>>, cookie?: string, address = '10.0.0.1') =>
    h.requests.handle(post('/api/hello', undefined, { 'CF-Connecting-IP': address, ...(cookie ? { Cookie: cookie } : {}) }));

  it('renews a token it issued exactly as it is', async () => {
    const h = await hub();
    const token = cookieOf(await hello(h))!;
    expect(cookieOf(await hello(h, `${DEVICE_COOKIE}=${token}`))).toBe(token);
  });

  it('replaces a missing, unsigned, cut-short or wrongly signed token with a fresh signed one', async () => {
    const h = await hub();
    const real = cookieOf(await hello(h))!;
    const oldUnsigned = randomToken();
    const stranger = (await (await tokensOver()).issue('a'))!;
    expect(oldUnsigned).toHaveLength(43);
    for (const sent of [oldUnsigned, real.slice(0, -2), `${real}00`, stranger, 'junk']) {
      const answer = await hello(h, `${DEVICE_COOKIE}=${sent}`);
      const given = cookieOf(answer)!;
      expect(given, sent).not.toBe(sent);
      expect(await h.devices.verified(given)).toBe(given);
    }
  });

  it('refuses a socket whose token is unsigned, cut short or from another key, with a 401', async () => {
    const h = await hub();
    const real = cookieOf(await hello(h))!;
    const stranger = (await (await tokensOver()).issue('a'))!;
    for (const sent of [randomToken(), real.slice(0, -1), stranger]) {
      expect((await h.requests.handle(upgrade({ Cookie: `${DEVICE_COOKIE}=${sent}` }))).status, sent).toBe(401);
    }
    expect((await h.requests.handle(upgrade({ Cookie: `${DEVICE_COOKIE}=${real}` }))).status).toBe(200);
    expect(h.sockets).toHaveLength(1);
  });

  it('refuses the 1,501st new device from one address in an hour with a bare, distinct refusal, but still renews the devices it knows', async () => {
    const h = await hub();
    const known = cookieOf(await hello(h, undefined, '10.5.5.5'))!;
    for (let n = 1; n < ADDRESS_NEW_TOKENS.max; n += 1) expect((await hello(h, undefined, '10.5.5.5')).status).toBe(200);
    const refused = await hello(h, undefined, '10.5.5.5');
    expect(refused.status).toBe(STATUS_NETWORK_FULL);
    expect(await refused.text()).toBe('');
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(cookieOf(await hello(h, `${DEVICE_COOKIE}=${known}`, '10.5.5.5'))).toBe(known);
    expect((await hello(h, undefined, '10.5.5.6')).status).toBe(200);
    h.harness.clock.now += ADDRESS_NEW_TOKENS.windowMs;
    expect((await hello(h, undefined, '10.5.5.5')).status).toBe(200);
  });

  it('counts a teacher’s sign-in as no new device', async () => {
    const h = await hub();
    const device = jar(await hello(h));
    expect(device).toContain(DEVICE_COOKIE);
    const reply = await h.requests.handle(post('/api/sign-in', { password: 'wrong-password', code: '000000' }, { Cookie: device }));
    expect(reply.headers.getSetCookie().filter((line) => line.startsWith(DEVICE_COOKIE))).toEqual([]);
  });
});
