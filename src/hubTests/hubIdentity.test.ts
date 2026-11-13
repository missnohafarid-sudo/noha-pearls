import { describe, expect, it } from 'vitest';
import { totpCode } from '../infrastructure/totp';
import { AdminSessionTable } from '../infrastructure/sql/adminSessions';
import { SqlLocks } from '../infrastructure/sql/locks';
import { SqlWindowMemory } from '../infrastructure/sql/windowEvents';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { migrate } from '../infrastructure/sql/schema';
import { ADMIN_SESSION_MS } from '../domain/adminAccess';
import { ADDRESS_WRONG_SIGN_INS } from '../ports/limits';
import { clearedCookieLine, cookieLine, parseCookies } from '../server/cookies';
import { LOCAL_ADDRESS } from '../server/address';
import { AdminSessions } from '../server/AdminSessions';
import { DeviceTokens } from '../server/DeviceTokens';
import { HubHttp, isSameOrigin } from '../server/HubHttp';
import { AdminCookie, adminSecretsOf, ADMIN_COOKIE, ConnectionCaller, DEVICE_COOKIE, deviceIdOf, identityOf } from '../server/identity';
import { SignInGuard } from '../server/SignInGuard';
import { constantTimeEqual, sha256Hex } from '../server/webCrypto';

const SECRETS = { password: 'teach-2468', totpSecret: 'JBSWY3DPEHPK3PXP' };
const ORIGIN = 'http://localhost';

describe('cookies', () => {
  it('reads a Cookie header and ignores what is not a pair', () => {
    expect([...parseCookies('a=1; b=two=2;  junk; =x; c=3')]).toEqual([['a', '1'], ['b', 'two=2'], ['c', '3']]);
    expect(parseCookies(null).size).toBe(0);
  });

  it('writes HttpOnly, SameSite=Strict cookies for the API only, Secure only over https', () => {
    expect(cookieLine('n', 'v', { maxAgeSeconds: 60, secure: true })).toBe('n=v; Path=/api; Max-Age=60; HttpOnly; SameSite=Strict; Secure');
    expect(cookieLine('n', 'v', { maxAgeSeconds: 60, secure: false })).not.toContain('Secure');
    expect(clearedCookieLine('n', false)).toContain('Max-Age=0');
  });
});

/** The hub's device tokens over a fresh database. */
async function tokens() {
  const db = new NodeSqlDatabase();
  migrate(db);
  return DeviceTokens.from(db, () => 1_800_000_000_000);
}

describe('the device', () => {
  it('has a random token the hub issued and an id that is a hash of it', async () => {
    const devices = await tokens();
    const [a, b] = [(await devices.issue('1.1.1.1'))!, (await devices.issue('1.1.1.1'))!];
    expect(a).not.toBe(b);
    expect(await devices.verified(a)).toBe(a);
    expect(await devices.verified('short')).toBeNull();
    expect(await devices.verified(undefined)).toBeNull();
    const id = await deviceIdOf(a);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain(a);
    expect(await deviceIdOf(a)).toBe(id);
    expect(await deviceIdOf(b)).not.toBe(id);
    expect(id).not.toBe((await sha256Hex(a)).slice(0, 32));
  });
});

const SESSION_ID = 'S'.repeat(43);

describe('the teacher cookie', () => {
  it('names a session, and is accepted only as it was signed', async () => {
    const cookie = await AdminCookie.from(SECRETS);
    const value = await cookie.sign(SESSION_ID);
    expect(await cookie.sessionIdOf(value)).toBe(SESSION_ID);
    const [id, signature] = value.split('.');
    expect(await cookie.sessionIdOf(`${'T'.repeat(43)}.${signature}`)).toBeNull();
    expect(await cookie.sessionIdOf(`${id}.${signature.replace(/^./, signature[0] === 'a' ? 'b' : 'a')}`)).toBeNull();
    for (const bad of [undefined, '', 'x', id, `${id}.`, `${id}.${'0'.repeat(64)}`, `5000.${signature}`]) expect(await cookie.sessionIdOf(bad)).toBeNull();
  });

  it('is signed with a key from both secrets, so replacing either one refuses it', async () => {
    const value = await (await AdminCookie.from(SECRETS)).sign(SESSION_ID);
    expect(await (await AdminCookie.from({ ...SECRETS, password: 'other-pass-1' })).sessionIdOf(value)).toBeNull();
    expect(await (await AdminCookie.from({ ...SECRETS, totpSecret: 'JBSWY3DPEHPK3PXQ' })).sessionIdOf(value)).toBeNull();
  });

  it('counts only until its session ends, asked of the clock each time', () => {
    let now = 0;
    const caller = new ConnectionCaller('device', { id: SESSION_ID, expiresAt: 100 }, () => now);
    expect(caller.isAdmin()).toBe(true);
    now = 100;
    expect(caller.isAdmin()).toBe(false);
    expect(caller.sessionRanOut()).toBe(true);
    expect(new ConnectionCaller('device', null, () => now).isAdmin()).toBe(false);
    expect(new ConnectionCaller('device', null, () => now).sessionRanOut()).toBe(false);
  });

  it('reads who sent a request from its cookies only', async () => {
    const db = new NodeSqlDatabase();
    migrate(db);
    const sessions = await AdminSessions.from(SECRETS, new AdminSessionTable(db), () => 1_800_000_000_000);
    const devices = await tokens();
    const token = (await devices.issue('1.1.1.1'))!;
    const { session, cookie } = await sessions.open();
    const request = (cookies: string) => new Request(`${ORIGIN}/api/hello`, { method: 'POST', headers: { Cookie: cookies } });
    expect(await identityOf(request(`${DEVICE_COOKIE}=${token}; ${ADMIN_COOKIE}=${cookie}`), sessions, devices)).toEqual({ deviceToken: token, device: await deviceIdOf(token), admin: session });
    expect(await identityOf(request(`${DEVICE_COOKIE}=bad`), sessions, devices)).toEqual({ deviceToken: null, device: null, admin: null });
    expect((await identityOf(request(`${DEVICE_COOKIE}=${token}; ${ADMIN_COOKIE}=${cookie}`), null, devices)).admin).toBeNull();
  });
});

describe('the secrets', () => {
  it('are used only when both are present and usable', () => {
    expect(adminSecretsOf({ ADMIN_PASSWORD: SECRETS.password, ADMIN_TOTP_SECRET: SECRETS.totpSecret })).toEqual(SECRETS);
    expect(adminSecretsOf({})).toBeNull();
    expect(adminSecretsOf({ ADMIN_PASSWORD: SECRETS.password })).toBeNull();
    expect(adminSecretsOf({ ADMIN_TOTP_SECRET: SECRETS.totpSecret })).toBeNull();
    expect(adminSecretsOf({ ADMIN_PASSWORD: 'short', ADMIN_TOTP_SECRET: SECRETS.totpSecret })).toBeNull();
    expect(adminSecretsOf({ ADMIN_PASSWORD: SECRETS.password, ADMIN_TOTP_SECRET: 'not a key' })).toBeNull();
  });
});

describe('constant-time comparison', () => {
  it('says yes only to equal texts, of any length', async () => {
    expect(await constantTimeEqual('abc', 'abc')).toBe(true);
    expect(await constantTimeEqual('abc', 'abd')).toBe(false);
    expect(await constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(await constantTimeEqual('', '')).toBe(true);
    expect(await constantTimeEqual('', 'x')).toBe(false);
  });
});

describe('the plain requests', () => {
  /** The hub's plain requests, each given who sent it the way the hub does it: worked out from the request's cookies. */
  async function hub(secrets: typeof SECRETS | null = SECRETS) {
    const db = new NodeSqlDatabase();
    migrate(db);
    const clock = { now: 1_800_000_000_000 };
    const now = () => clock.now;
    const sessions = secrets ? await AdminSessions.from(secrets, new AdminSessionTable(db), now) : null;
    const devices = await DeviceTokens.from(db, now);
    const plain = new HubHttp(secrets, sessions, new SignInGuard(new SqlLocks(db), new SqlWindowMemory(db), now), devices, now);
    const http = {
      hello: async (request: Request) => plain.hello(request, await identityOf(request, sessions, devices)),
      signIn: async (request: Request) => plain.signIn(request),
      signOut: (request: Request) => plain.signOut(request),
    };
    return { http, clock };
  }
  const post = (path: string, body?: unknown, headers: Record<string, string> = {}, origin = ORIGIN) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    return new Request(`${origin}${path}`, { method: 'POST', headers: { 'Content-Length': String(new TextEncoder().encode(text ?? '').length), ...headers }, body: text });
  };
  const cookieOf = (response: Response, name: string) => response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`));
  const pair = (line: string | undefined) => (line ?? '').split(';')[0];
  const goodCode = (now: number) => totpCode(SECRETS.totpSecret, now);
  const wrongCode = async (now: number) => String((Number(await goodCode(now)) + 123_457) % 1_000_000).padStart(6, '0');

  it('gives a device its cookie and keeps it, and says it is not the admin', async () => {
    const { http, clock } = await hub();
    const first = await http.hello(post('/api/hello'));
    expect(await first.json()).toEqual({ admin: false, now: clock.now });
    const line = cookieOf(first, DEVICE_COOKIE);
    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Strict');
    expect(line).not.toContain('Secure');
    const second = await http.hello(post('/api/hello', undefined, { Cookie: pair(line) }));
    expect(pair(cookieOf(second, DEVICE_COOKIE))).toBe(pair(line));
  });

  it('makes cookies Secure over https', async () => {
    const { http } = await hub();
    expect(cookieOf(await http.hello(post('/api/hello', undefined, {}, 'https://hub.test')), DEVICE_COOKIE)).toContain('Secure');
  });

  it('signs in with the right pair, sets a seven-day cookie, and then says the device is the admin', async () => {
    const { http, clock } = await hub();
    const response = await http.signIn(post('/api/sign-in', { password: SECRETS.password, code: await goodCode(clock.now) }));
    expect(await response.json()).toEqual({ ok: true });
    const line = cookieOf(response, ADMIN_COOKIE);
    expect(line).toContain(`Max-Age=${ADMIN_SESSION_MS / 1000}`);
    expect(line).toContain('HttpOnly');
    const hello = await http.hello(post('/api/hello', undefined, { Cookie: pair(line) }));
    expect(await hello.json()).toMatchObject({ admin: true });
    clock.now += ADMIN_SESSION_MS;
    expect(await (await http.hello(post('/api/hello', undefined, { Cookie: pair(line) }))).json()).toMatchObject({ admin: false });
  });

  it('answers the same no for a wrong password and for a wrong code, and sets no admin cookie', async () => {
    const { http, clock } = await hub();
    const wrongPassword = await http.signIn(post('/api/sign-in', { password: 'wrong-password', code: await goodCode(clock.now) }));
    const wrongCodeAnswer = await http.signIn(post('/api/sign-in', { password: SECRETS.password, code: await wrongCode(clock.now) }));
    expect(await wrongPassword.text()).toBe(await wrongCodeAnswer.text());
    expect(cookieOf(wrongPassword, ADMIN_COOKIE)).toBeUndefined();
    expect(cookieOf(wrongCodeAnswer, ADMIN_COOKIE)).toBeUndefined();
    expect(wrongPassword.status).toBe(wrongCodeAnswer.status);
  });

  it('accepts the same code for a second sign-in while it is valid', async () => {
    const { http, clock } = await hub();
    const body = { password: SECRETS.password, code: await goodCode(clock.now) };
    expect(await (await http.signIn(post('/api/sign-in', body))).json()).toEqual({ ok: true });
    expect(await (await http.signIn(post('/api/sign-in', body))).json()).toEqual({ ok: true });
  });

  it('locks an address after five wrong attempts for fifteen minutes, even for the right pair, and leaves other addresses alone', async () => {
    const { http, clock } = await hub();
    const bad = async (address?: string) => http.signIn(post('/api/sign-in', { password: 'nope-nope-1', code: await goodCode(clock.now) }, address ? { 'CF-Connecting-IP': address } : {}));
    for (let n = 0; n < 5; n += 1) await bad('10.0.0.1');
    const right = async (address: string) => (await (await http.signIn(post('/api/sign-in', { password: SECRETS.password, code: await goodCode(clock.now) }, { 'CF-Connecting-IP': address }))).json()) as { ok: boolean };
    expect(await right('10.0.0.1')).toEqual({ ok: false });
    expect(await right('10.0.0.2')).toEqual({ ok: true });
    clock.now += ADDRESS_WRONG_SIGN_INS.lockMs - 1;
    expect(await right('10.0.0.1')).toEqual({ ok: false });
    clock.now += 1;
    expect(await right('10.0.0.1')).toEqual({ ok: true });
  });

  it('uses one fixed address when the request names none, and a success clears the count', async () => {
    const { http, clock } = await hub();
    const attempt = async (password: string) => (await (await http.signIn(post('/api/sign-in', { password, code: await goodCode(clock.now) }))).json()) as { ok: boolean };
    for (let n = 0; n < 4; n += 1) await attempt('wrong-wrong-1');
    expect(await attempt(SECRETS.password)).toEqual({ ok: true });
    for (let n = 0; n < 4; n += 1) await attempt('wrong-wrong-1');
    expect(await attempt(SECRETS.password)).toEqual({ ok: true });
    expect(LOCAL_ADDRESS).toBe('local');
  });

  it('refuses every sign-in when the secrets are missing, with the development values or any others', async () => {
    const { http, clock } = await hub(null);
    for (const password of [SECRETS.password, 'anything-at-all', '']) {
      const response = await http.signIn(post('/api/sign-in', { password, code: await goodCode(clock.now) }));
      expect(await response.json()).toEqual({ ok: false });
      expect(cookieOf(response, ADMIN_COOKIE)).toBeUndefined();
    }
  });

  it('refuses a body that is not a password and a code, or is too long', async () => {
    const { http } = await hub();
    for (const body of [{}, { password: 1, code: 2 }, 'text', null, { password: 'x'.repeat(2000), code: '123456' }]) {
      expect(await (await http.signIn(post('/api/sign-in', body))).json()).toEqual({ ok: false });
    }
  });

  it('signs out by removing the cookie', async () => {
    const { http } = await hub();
    expect(cookieOf(http.signOut(post('/api/sign-out')), ADMIN_COOKIE)).toContain('Max-Age=0');
  });

  it('accepts a request from its own origin or none, and refuses another origin', () => {
    expect(isSameOrigin(post('/api/hello'))).toBe(true);
    expect(isSameOrigin(post('/api/hello', undefined, { Origin: ORIGIN }))).toBe(true);
    expect(isSameOrigin(post('/api/hello', undefined, { Origin: 'http://evil.test' }))).toBe(false);
  });
});
