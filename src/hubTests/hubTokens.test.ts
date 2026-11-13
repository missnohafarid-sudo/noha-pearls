import { describe, expect, it } from 'vitest';
import { ADDRESS_NEW_TOKENS } from '../ports/limits';
import { migrate } from '../infrastructure/sql/schema';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { STATUS_TOO_MANY } from '../ports/wire';
import { DeviceTokens } from '../server/DeviceTokens';
import { DEVICE_COOKIE } from '../server/identity';
import { randomToken } from '../server/webCrypto';
import { hub, jar, post, SECRETS, upgrade } from './requestsKit';

const NOW = () => 1_800_000_000_000;
const cookieOf = (response: Response) => response.headers.getSetCookie().find((line) => line.startsWith(`${DEVICE_COOKIE}=`))?.split(';')[0].slice(DEVICE_COOKIE.length + 1);

async function tokensOver(secrets: typeof SECRETS | null, db = new NodeSqlDatabase(), now = NOW) {
  migrate(db);
  return DeviceTokens.from(secrets, db, now);
}

describe('a device token', () => {
  it('is a random part and a signature, which only the hub that issued it accepts', async () => {
    const devices = await tokensOver(SECRETS);
    const token = (await devices.issue('1.1.1.1'))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}\.[0-9a-f]{64}$/);
    expect(await devices.verified(token)).toBe(token);
    expect(await devices.issue('1.1.1.1')).not.toBe(token);
  });

  it('is refused when it is forged, cut short, extended, changed, or signed for another random part', async () => {
    const devices = await tokensOver(SECRETS);
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
    const mine = await tokensOver(SECRETS);
    const theirs = await tokensOver({ ...SECRETS, password: 'another-pass-9' });
    const withoutSecrets = await tokensOver(null);
    const alien = (await theirs.issue('a'))!;
    expect(await mine.verified(alien)).toBeNull();
    expect(await theirs.verified(alien)).toBe(alien);
    expect(await withoutSecrets.verified((await mine.issue('a'))!)).toBeNull();
  });

  it('is signed with a key made once and kept in the database when the hub has no secrets, so that a restart keeps every device', async () => {
    const db = new NodeSqlDatabase();
    const first = await tokensOver(null, db);
    const token = (await first.issue('a'))!;
    expect(await (await tokensOver(null, db)).verified(token)).toBe(token);
    expect(await (await tokensOver(null)).verified(token)).toBeNull();
  });

  it('is signed with a key from the secrets when the hub has them, the same on every start, and not stored', async () => {
    const [first, second] = [new NodeSqlDatabase(), new NodeSqlDatabase()];
    const token = (await (await tokensOver(SECRETS, first)).issue('a'))!;
    expect(await (await tokensOver(SECRETS, second)).verified(token)).toBe(token);
    expect(first.all('SELECT key FROM meta WHERE key = ?', 'device-token-key')).toEqual([]);
  });

  it('is issued at most 300 an hour to one address, and the room comes back as the hour moves on', async () => {
    const clock = { now: NOW() };
    const devices = await tokensOver(SECRETS, new NodeSqlDatabase(), () => clock.now);
    for (let n = 0; n < ADDRESS_NEW_TOKENS.max; n += 1) expect(await devices.issue('9.9.9.9')).not.toBeNull();
    expect(await devices.issue('9.9.9.9')).toBeNull();
    expect(await devices.issue('9.9.9.8')).not.toBeNull();
    clock.now += ADDRESS_NEW_TOKENS.windowMs;
    expect(await devices.issue('9.9.9.9')).not.toBeNull();
  });
});

describe('the hello that gives a device its token', () => {
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
    const stranger = (await (await tokensOver({ ...SECRETS, totpSecret: 'JBSWY3DPEHPK3PXQ' })).issue('a'))!;
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
    const stranger = (await (await tokensOver({ ...SECRETS, totpSecret: 'JBSWY3DPEHPK3PXQ' })).issue('a'))!;
    for (const sent of [randomToken(), real.slice(0, -1), stranger]) {
      expect((await h.requests.handle(upgrade({ Cookie: `${DEVICE_COOKIE}=${sent}` }))).status, sent).toBe(401);
    }
    expect((await h.requests.handle(upgrade({ Cookie: `${DEVICE_COOKIE}=${real}` }))).status).toBe(200);
    expect(h.sockets).toHaveLength(1);
  });

  it('refuses the 301st new device from one address in an hour with a bare 429, but still renews the devices it knows', async () => {
    const h = await hub();
    const known = cookieOf(await hello(h, undefined, '10.5.5.5'))!;
    for (let n = 1; n < ADDRESS_NEW_TOKENS.max; n += 1) expect((await hello(h, undefined, '10.5.5.5')).status).toBe(200);
    const refused = await hello(h, undefined, '10.5.5.5');
    expect(refused.status).toBe(STATUS_TOO_MANY);
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
