import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_SESSION_MS } from '../domain/adminAccess';
import { AdminSessionTable } from '../infrastructure/sql/adminSessions';
import { SqlWindowMemory } from '../infrastructure/sql/windowEvents';
import { totpCode } from '../infrastructure/totp';
import { ADDRESS_WRONG_SIGN_INS, SCHOOL_CODE_GUESSES } from '../ports/limits';
import { CLOSE_SESSION_ENDED } from '../ports/wire';
import { AdminCookie } from '../server/identity';
import { SignInGuard } from '../server/SignInGuard';
import { randomToken } from '../server/webCrypto';
import { createHarness, type Harness } from './hubHarness';
import { hub, jar, LOCAL, post, SECRETS, teacher, upgrade } from './requestsKit';

describe('the teacher’s sessions', () => {
  const helloAs = async (h: Awaited<ReturnType<typeof hub>>, cookie: string, origin = LOCAL) =>
    ((await (await h.requests.handle(post('/api/hello', undefined, { Cookie: cookie }, origin))).json()) as { admin: boolean }).admin;

  it('end for every device that holds the cookie when she signs out, even one that never saw the sign-out', async () => {
    const h = await hub();
    const mine = await teacher(h);
    const second = jar(await h.requests.handle(post('/api/hello')));
    const replayed = `${second}; ${mine.cookie.split('; ').find((pair) => pair.startsWith('noha_admin'))}`;
    expect(await helloAs(h, replayed)).toBe(true);
    await h.requests.handle(upgrade({ Cookie: replayed }));
    expect(h.sockets[0].messages()[0]).toMatchObject({ type: 'hello', admin: true });
    await h.requests.handle(post('/api/sign-out', undefined, { Cookie: mine.cookie }));
    expect(h.sockets[0].closedWith?.code).toBe(CLOSE_SESSION_ENDED);
    expect(await helloAs(h, replayed)).toBe(false);
    await h.requests.handle(upgrade({ Cookie: replayed }));
    expect(h.sockets[1].messages()[0]).toMatchObject({ type: 'hello', admin: false });
  });

  it('end at the moment their row names, and the alarm forgets the rows that have ended', async () => {
    const h = await hub();
    const mine = await teacher(h);
    h.harness.clock.now += ADMIN_SESSION_MS - 1;
    expect(await helloAs(h, mine.cookie)).toBe(true);
    h.harness.clock.now += 1;
    expect(await helloAs(h, mine.cookie)).toBe(false);
    const table = new AdminSessionTable(h.harness.meter);
    expect(h.harness.sql.all('SELECT id FROM admin_sessions')).toHaveLength(1);
    table.prune(h.harness.clock.now);
    expect(h.harness.sql.all('SELECT id FROM admin_sessions')).toHaveLength(0);
  });

  it('cannot be extended or invented by the cookie: a cookie signed by this hub for a session it never opened counts for nothing', async () => {
    const h = await hub();
    const device = jar(await h.requests.handle(post('/api/hello')));
    const forged = await (await AdminCookie.from(SECRETS)).sign(randomToken());
    expect(await helloAs(h, `${device}; noha_admin=${forged}`)).toBe(false);
    await h.requests.handle(upgrade({ Cookie: `${device}; noha_admin=${forged}` }));
    expect(h.sockets[0].messages()[0]).toMatchObject({ type: 'hello', admin: false });
  });
});

describe('secrets that hold a public development value', () => {
  const HTTPS = 'https://school.example';
  const REAL_PASSWORD = 'a-real-password-1';
  const REAL_KEY = 'JBSWY3DPEHPK3PXQ';
  const signIn = async (h: Awaited<ReturnType<typeof hub>>, secrets: { password: string; totpSecret: string }, origin: string) =>
    ((await (await h.requests.handle(post('/api/sign-in', { password: secrets.password, code: await totpCode(secrets.totpSecret, h.harness.clock.now) }, { 'CF-Connecting-IP': '5.5.5.5' }, origin))).json()) as { ok: boolean }).ok;

  it('give no admin over https even to a cookie that was honestly signed in on this computer', async () => {
    const h = await hub(SECRETS);
    const { cookie } = await teacher(h);
    const helloAt = async (origin: string) => ((await (await h.requests.handle(post('/api/hello', undefined, { Cookie: cookie }, origin))).json()) as { admin: boolean }).admin;
    expect(await helloAt(LOCAL)).toBe(true);
    expect(await helloAt(HTTPS)).toBe(false);
    await h.requests.handle(upgrade({ Cookie: cookie }, HTTPS));
    expect(h.sockets[0].messages()[0]).toMatchObject({ type: 'hello', admin: false });
  });

  it('give no admin over https to a cookie forged with the public development key', async () => {
    const h = await hub(SECRETS);
    const device = jar(await h.requests.handle(post('/api/hello', undefined, {}, HTTPS)));
    const forged = await (await AdminCookie.from(SECRETS)).sign(randomToken());
    await h.requests.handle(upgrade({ Cookie: `${device}; noha_admin=${forged}` }, HTTPS));
    expect(h.sockets[0].messages()[0]).toMatchObject({ type: 'hello', admin: false });
  });

  it('refuse sign-in off this computer when only the password is the public one, or only the authenticator key is', async () => {
    const publicPassword = { password: SECRETS.password, totpSecret: REAL_KEY };
    const publicKey = { password: REAL_PASSWORD, totpSecret: SECRETS.totpSecret };
    for (const secrets of [publicPassword, publicKey]) {
      const h = await hub(secrets);
      expect(await signIn(h, secrets, HTTPS)).toBe(false);
      expect(await signIn(h, secrets, LOCAL)).toBe(true);
    }
    const real = { password: REAL_PASSWORD, totpSecret: REAL_KEY };
    expect(await signIn(await hub(real), real, HTTPS)).toBe(true);
  });
});

describe('the school-wide guard on the six digits', () => {
  const from = (n: number) => `9.9.${Math.floor(n / 250)}.${n % 250}`;
  const wrongCode = async (h: Awaited<ReturnType<typeof hub>>) => String((Number(await totpCode(SECRETS.totpSecret, h.harness.clock.now)) + 123_457) % 1_000_000).padStart(6, '0');
  const attempt = async (h: Awaited<ReturnType<typeof hub>>, n: number, password: string, code: string) =>
    ((await (await h.requests.handle(post('/api/sign-in', { password, code }, { 'CF-Connecting-IP': from(n) }))).json()) as { ok: boolean }).ok;
  const rightPair = async (h: Awaited<ReturnType<typeof hub>>, n: number) => attempt(h, n, SECRETS.password, await totpCode(SECRETS.totpSecret, h.harness.clock.now));

  it('is not tripped by wrong passwords, however many and from however many addresses', async () => {
    const h = await hub();
    for (let n = 0; n < 40; n += 1) expect(await attempt(h, n, 'not-the-password-1', await totpCode(SECRETS.totpSecret, h.harness.clock.now))).toBe(false);
    expect(await rightPair(h, 100)).toBe(true);
  });

  it('closes sign-in for everyone after more than ten wrong codes behind the right password, from any addresses, until the hour has passed', async () => {
    const h = await hub();
    for (let n = 0; n < SCHOOL_CODE_GUESSES.max; n += 1) expect(await attempt(h, n, SECRETS.password, await wrongCode(h))).toBe(false);
    expect(await rightPair(h, 200)).toBe(false);
    expect(await attempt(h, 201, 'not-the-password-1', '000000')).toBe(false);
    h.harness.clock.now += SCHOOL_CODE_GUESSES.lockMs - 1;
    expect(await rightPair(h, 202)).toBe(false);
    h.harness.clock.now += 1;
    expect(await rightPair(h, 203)).toBe(true);
  });

  it('says that sign-in is closed when the school-wide closure refuses, and only that it failed when one address is locked', async () => {
    const h = await hub();
    const answer = async (n: number, password: string, code: string) => (await (await h.requests.handle(post('/api/sign-in', { password, code }, { 'CF-Connecting-IP': from(n) }))).json()) as unknown;
    for (let n = 0; n < ADDRESS_WRONG_SIGN_INS.max; n += 1) expect(await answer(1, 'not-the-password-1', '000000')).toEqual({ ok: false });
    expect(await answer(1, SECRETS.password, await totpCode(SECRETS.totpSecret, h.harness.clock.now))).toEqual({ ok: false });
    for (let n = 10; n < 10 + SCHOOL_CODE_GUESSES.max - 1; n += 1) expect(await answer(n, SECRETS.password, await wrongCode(h))).toEqual({ ok: false });
    expect(await answer(40, SECRETS.password, await wrongCode(h))).toEqual({ ok: false, closed: true });
    expect(await answer(41, SECRETS.password, await totpCode(SECRETS.totpSecret, h.harness.clock.now))).toEqual({ ok: false, closed: true });
    h.harness.clock.now += SCHOOL_CODE_GUESSES.lockMs;
    expect(await answer(42, SECRETS.password, await totpCode(SECRETS.totpSecret, h.harness.clock.now))).toEqual({ ok: true });
  });

  it('keeps its count and its closure when the hub sleeps and wakes', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'noha-pearls-guard-'));
    try {
      const file = join(folder, 'hub.sqlite');
      const guardOver = (harness: Harness) => new SignInGuard(harness.locks, new SqlWindowMemory(harness.meter), () => harness.clock.now);
      const guess = (guard: SignInGuard, n: number) => guard.begin(from(n)) && guard.finish(from(n), 'wrong-code');
      const before = createHarness(file);
      for (let n = 0; n < SCHOOL_CODE_GUESSES.max - 1; n += 1) guess(guardOver(before), n);
      const awake = createHarness(file);
      expect(guardOver(awake).begin(from(50))).toBe(true);
      guess(guardOver(awake), 51);
      const later = createHarness(file);
      expect(guardOver(later).begin(from(52))).toBe(false);
      later.clock.now += SCHOOL_CODE_GUESSES.lockMs;
      expect(guardOver(later).begin(from(53))).toBe(true);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
