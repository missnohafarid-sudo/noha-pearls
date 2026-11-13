import { describe, expect, it, vi } from 'vitest';
import { LOCK_MS } from '../domain/adminAccess';
import { hub, jar, LOCAL, post, SECRETS, teacher, upgrade } from './requestsKit';
import { totpCode } from '../infrastructure/totp';
import { MAX_POST_BODY_BYTES } from '../ports/limits';
import { CLOSE_SESSION_ENDED } from '../ports/wire';
import { answerWithoutHub } from '../server/gateway';
import { HubHttp } from '../server/HubHttp';

describe('the cheap refusals come first', () => {
  it('refuses a foreign origin, the origin called null, and a method that is not allowed, before anything is read', async () => {
    const { requests, sockets } = await hub();
    const { cookie } = await teacher(await hub());
    for (const origin of ['http://evil.example', 'null']) {
      expect((await requests.handle(upgrade({ Origin: origin, Cookie: cookie }))).status, origin).toBe(403);
      expect((await requests.handle(post('/api/hello', undefined, { Origin: origin }))).status, origin).toBe(403);
    }
    expect((await requests.handle(new Request(`${LOCAL}/api/hello`, { method: 'GET' }))).status).toBe(404);
    expect(sockets).toHaveLength(0);
  });

  it('lets a socket open without an origin only with a device cookie', async () => {
    const h = await hub();
    expect((await h.requests.handle(upgrade())).status).toBe(401);
    const device = jar(await h.requests.handle(post('/api/hello')));
    expect((await h.requests.handle(upgrade({ Cookie: device }))).status).toBe(200);
    expect((await h.requests.handle(upgrade({ Cookie: device, Origin: LOCAL }))).status).toBe(200);
    expect(h.sockets).toHaveLength(2);
  });

  it('refuses a body whose length is missing or too big without reading it, and stops reading one that is longer than it said', async () => {
    const { requests } = await hub();
    let pulled = 0;
    const stream = (chunks: number) =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          if (pulled > chunks) controller.close();
          else controller.enqueue(new Uint8Array(64 * 1024).fill(97));
        },
      });
    const request = (length: string | null, chunks: number) =>
      new Request(`${LOCAL}/api/sign-in`, { method: 'POST', body: stream(chunks), duplex: 'half', headers: length === null ? {} : { 'Content-Length': length } } as RequestInit);
    const refused = async (length: string | null, status: number) => {
      const asked = request(length, 80);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const primed = pulled;
      expect((await requests.handle(asked)).status).toBe(status);
      expect(pulled).toBe(primed);
    };
    await refused(String(5_000_000), 413);
    await refused(null, 411);
    pulled = 0;
    const lying = request('10', 80);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const primed = pulled;
    expect(await (await requests.handle(lying)).json()).toEqual({ ok: false });
    expect((pulled - primed) * 64 * 1024).toBeLessThanOrEqual(2 * 64 * 1024);
    expect(MAX_POST_BODY_BYTES).toBeLessThan(64 * 1024);
  });
});

describe('signing out', () => {
  it('closes every socket of the device at once, and a socket opened afterwards is a visitor’s; other devices are left alone', async () => {
    const h = await hub();
    const mine = await teacher(h, '10.0.0.1');
    const other = await teacher(h, '10.0.0.2');
    await h.requests.handle(upgrade({ Cookie: mine.cookie }));
    await h.requests.handle(upgrade({ Cookie: mine.cookie }));
    await h.requests.handle(upgrade({ Cookie: other.cookie }));
    expect(h.sockets.map((socket) => socket.messages()[0])).toMatchObject([{ admin: true }, { admin: true }, { admin: true }]);
    const out = await h.requests.handle(post('/api/sign-out', undefined, { Cookie: mine.cookie }));
    expect(out.status).toBe(200);
    expect(h.sockets.map((socket) => socket.closedWith?.code)).toEqual([CLOSE_SESSION_ENDED, CLOSE_SESSION_ENDED, undefined]);
    await h.requests.handle(upgrade({ Cookie: mine.device }));
    const reopened = h.sockets[3];
    expect(reopened.messages()[0]).toMatchObject({ type: 'hello', admin: false });
    h.registry.closeExpired();
    expect(h.sockets[2].closedWith).toBeNull();
  });
});

describe('the order of signing out', () => {
  it('closes the device\'s sockets before the response that signs it out is built', async () => {
    const h = await hub();
    const mine = await teacher(h, '10.0.0.1');
    await h.requests.handle(upgrade({ Cookie: mine.cookie }));
    let closedWhenBuilding: (number | undefined)[] = [];
    const original = HubHttp.prototype.signOut;
    const build = vi.spyOn(HubHttp.prototype, 'signOut').mockImplementation(function (this: HubHttp, request: Request) {
      closedWhenBuilding = h.sockets.map((socket) => socket.closedWith?.code);
      return original.call(this, request);
    });
    await h.requests.handle(post('/api/sign-out', undefined, { Cookie: mine.cookie }));
    expect(build).toHaveBeenCalledTimes(1);
    expect(closedWhenBuilding).toEqual([CLOSE_SESSION_ENDED]);
    build.mockRestore();
  });
});

describe('signing in', () => {
  const attempt = (h: Awaited<ReturnType<typeof hub>>, password: string, code: string, address: string, origin = LOCAL) =>
    h.requests.handle(post('/api/sign-in', { password, code }, { 'CF-Connecting-IP': address }, origin)).then((response) => response.json() as Promise<{ ok: boolean }>);

  it('counts wrong attempts that arrive together, so that thirty at once lock the address and the right pair is refused until the lock ends', async () => {
    const h = await hub();
    const code = await totpCode(SECRETS.totpSecret, h.harness.clock.now);
    await Promise.all(Array.from({ length: 30 }, () => attempt(h, 'wrong-password', '000000', '1.2.3.4')));
    expect(await attempt(h, SECRETS.password, code, '1.2.3.4')).toEqual({ ok: false });
    h.harness.clock.now += LOCK_MS - 1;
    expect(await attempt(h, SECRETS.password, await totpCode(SECRETS.totpSecret, h.harness.clock.now), '1.2.3.4')).toEqual({ ok: false });
    h.harness.clock.now += 1;
    expect(await attempt(h, SECRETS.password, await totpCode(SECRETS.totpSecret, h.harness.clock.now), '1.2.3.4')).toEqual({ ok: true });
  });

  it('counts an IPv6 address by its /64, so changing the end of it does not escape the lock', async () => {
    const h = await hub();
    const addresses = ['2001:db8:1:2::1', '2001:db8:1:2:ffff::9', '2001:DB8:1:2:0:0:0:3', '2001:db8:1:2::4', '2001:db8:1:2::5'];
    for (const address of addresses) await attempt(h, 'wrong-password', '000000', address);
    const code = await totpCode(SECRETS.totpSecret, h.harness.clock.now);
    expect(await attempt(h, SECRETS.password, code, '2001:db8:1:2::77')).toEqual({ ok: false });
    expect(await attempt(h, SECRETS.password, code, '2001:db8:1:3::77')).toEqual({ ok: true });
  });

  it('is refused over plain http away from this computer, and on this computer is allowed', async () => {
    const real = { password: 'a-real-password-1', totpSecret: 'JBSWY3DPEHPK3PXQ' };
    const h = await hub(real);
    const code = await totpCode(real.totpSecret, h.harness.clock.now);
    expect(await attempt(h, real.password, code, '1.1.1.1', 'http://school.example')).toEqual({ ok: false });
    expect(await attempt(h, real.password, code, '1.1.1.1', 'https://school.example')).toEqual({ ok: true });
    expect(await attempt(h, real.password, code, '1.1.1.1', 'http://127.0.0.1:8787')).toEqual({ ok: true });
  });

  it('is refused by a deployed hub whose secrets are the public development ones, and only there', async () => {
    const real = { password: 'a-real-password-1', totpSecret: 'JBSWY3DPEHPK3PXQ' };
    const deployedWithDevelopment = await hub(SECRETS);
    const code = await totpCode(SECRETS.totpSecret, deployedWithDevelopment.harness.clock.now);
    expect(await attempt(deployedWithDevelopment, SECRETS.password, code, '1.1.1.1', 'https://school.example')).toEqual({ ok: false });
    expect(await attempt(deployedWithDevelopment, SECRETS.password, code, '1.1.1.1', LOCAL)).toEqual({ ok: true });
    const deployedWithReal = await hub(real);
    expect(await attempt(deployedWithReal, real.password, await totpCode(real.totpSecret, deployedWithReal.harness.clock.now), '1.1.1.1', 'https://school.example')).toEqual({ ok: true });
  });
});

describe('what the Worker answers without waking the hub', () => {
  const ask = (path: string, method = 'GET') => answerWithoutHub(new Request(`https://school.example${path}`, { method }));

  it('answers the health check itself, for the methods that read', async () => {
    expect(await ask('/api/health')?.json()).toEqual({ ok: true });
    expect(ask('/api/health', 'HEAD')?.status).toBe(200);
    expect(ask('/api/health', 'POST')?.status).toBe(405);
  });

  it('forwards only the four paths the hub serves, and answers any other /api path with a 404', () => {
    for (const path of ['/api/live', '/api/hello', '/api/sign-in', '/api/sign-out']) expect(ask(path), path).toBeNull();
    for (const path of ['/api/', '/api/other', '/api/live/extra', '/api/hello/', '/api/health/x', '/api/../x', '/api/%2e%2e']) expect(ask(path)?.status, path).toBe(404);
  });
});
