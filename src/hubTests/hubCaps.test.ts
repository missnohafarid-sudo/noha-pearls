import { describe, expect, it } from 'vitest';
import { SOCKETS_PER_ADDRESS, WATCHES_PER_DEVICE, WATCHES_PER_HUB } from '../ports/limits';
import { STATUS_TOO_MANY } from '../ports/wire';
import { Connection } from '../server/Connection';
import { deviceIdOf } from '../server/identity';
import { classroom, FAR, seatFor } from './classKit';
import { connect, createHarness } from './hubHarness';
import { hub, teacher, upgrade } from './requestsKit';

describe('the sockets the hub accepts', () => {
  const cookieFor = async (h: Awaited<ReturnType<typeof hub>>, name: string) => `noha_device=${(await h.devices.issue(name))!}`;

  it('holds at most six for one device', async () => {
    const h = await hub();
    const cookie = await cookieFor(h, 'issuer');
    const statuses: number[] = [];
    for (let n = 0; n < 7; n += 1) statuses.push((await h.requests.handle(upgrade({ Cookie: cookie }))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, STATUS_TOO_MANY]);
    expect((await h.requests.handle(upgrade({ Cookie: await cookieFor(h, 'issuer') }))).status).toBe(200);
  });

  it('counts the sockets a hub woke up with, as well as the ones opened since', async () => {
    const h = await hub();
    const cookie = await cookieFor(h, 'issuer');
    for (let n = 0; n < 6; n += 1) await h.requests.handle(upgrade({ Cookie: cookie }));
    const woken = createHarness();
    for (const socket of h.sockets) woken.registry.add(socket, Connection.restore(socket, woken.core) as Connection);
    const { device } = h.sockets[0].deserializeAttachment() as { device: string };
    const counts = woken.registry.countsFor(device, 'local');
    expect(counts).toEqual({ ofDevice: 6, ofAddress: 6, inHub: 6 });
    expect(woken.gate.socketVerdict(counts, false)).toBe('refuse');
  });

  it('holds at most 400 visitors for one address, and the next address is not affected', async () => {
    const h = await hub();
    const open = async (n: number) => (await h.requests.handle(upgrade({ 'CF-Connecting-IP': '10.9.9.9', Cookie: await cookieFor(h, `issuer-${n}`) }))).status;
    for (let n = 0; n < SOCKETS_PER_ADDRESS; n += 1) expect(await open(n)).toBe(200);
    expect(await open(SOCKETS_PER_ADDRESS)).toBe(STATUS_TOO_MANY);
    expect((await h.requests.handle(upgrade({ 'CF-Connecting-IP': '10.9.9.8', Cookie: await cookieFor(h, 'other') }))).status).toBe(200);
  });

  it('keeps the signed-in teacher and a seated student out of a full address: they still open sockets while a visitor gets 429', async () => {
    const h = await hub();
    const address = '10.9.9.9';
    const { harness } = h;
    const admin = await teacher(h, address);
    const classId = (await harness.store.list('classes'))[0].id;
    const lessonId = (await harness.store.list('lessons'))[0].id;
    const teacherId = (await harness.store.list('teachers'))[0].id;
    const page = connect(harness, 'laptop', FAR);
    await page.call(1, 'sessions', 'start', lessonId, classId, teacherId);
    const session = (await harness.store.list('sessions'))[0];
    const student = (await harness.store.list('students'))[0];
    const studentCookie = `noha_device=${(await h.devices.issue('student'))!}`;
    const device = await deviceIdOf(studentCookie.split('=')[1]);
    const phone = connect(harness, device, null, address);
    expect(await phone.call(1, 'participants', 'join', session.code, student.groupId, student.id)).toMatchObject({ ok: true });
    await page.call(2, 'admission', 'admit', `${session.id}:${device}`, student.id);
    const waitingCookie = `noha_device=${(await h.devices.issue('waiting'))!}`;
    const waiting = connect(harness, await deviceIdOf(waitingCookie.split('=')[1]), null, address);
    expect(await waiting.call(1, 'participants', 'join', session.code, student.groupId, student.id)).toMatchObject({ ok: true });
    const at = (cookie: string) => upgrade({ 'CF-Connecting-IP': address, Cookie: cookie });
    const alreadyOpen = h.registry.countsFor('nobody', address).ofAddress;
    for (let n = 0; n < SOCKETS_PER_ADDRESS - alreadyOpen; n += 1) expect((await h.requests.handle(at(await cookieFor(h, `issuer-${n}`)))).status).toBe(200);
    expect(h.registry.countsFor('nobody', address).ofAddress).toBe(SOCKETS_PER_ADDRESS);
    expect((await h.requests.handle(at(await cookieFor(h, 'visitor')))).status).toBe(STATUS_TOO_MANY);
    expect((await h.requests.handle(at(admin.cookie))).status).toBe(200);
    expect((await h.requests.handle(at(studentCookie))).status).toBe(200);
    expect((await h.requests.handle(at(waitingCookie))).status).toBe(STATUS_TOO_MANY);
    expect(h.sockets.at(-1)?.messages()[0]).toMatchObject({ type: 'hello', admin: false });
  });

  it('holds at most 3000 visitors altogether', async () => {
    const h = await hub();
    const open = async (n: number) => (await h.requests.handle(upgrade({ 'CF-Connecting-IP': `10.${n % 250}.${Math.floor(n / 250)}.1`, Cookie: await cookieFor(h, `issuer-${n}`) }))).status;
    for (let n = 0; n < 3000; n += 1) await open(n);
    expect(h.sockets).toHaveLength(3000);
    expect(await open(3000)).toBe(STATUS_TOO_MANY);
    expect(h.sockets).toHaveLength(3000);
    const { cookie } = await teacher(h);
    expect((await h.requests.handle(upgrade({ Cookie: cookie }))).status).toBe(200);
  });
});

describe('the live reads the hub holds', () => {
  it('lets a device hold 48 across all its sockets together, not 48 on each', async () => {
    const harness = createHarness();
    await harness.core.seed(true);
    const sockets = Array.from({ length: 6 }, () => connect(harness, 'one-phone'));
    for (let id = 1; id <= WATCHES_PER_DEVICE; id += 1) {
      const socket = sockets[id % sockets.length];
      await socket.watch(id, 'teachers', 'watchTeachers');
      expect(socket.socket.refusal(id)).toBeUndefined();
    }
    expect(harness.registry.ofDevice('one-phone')).toBe(WATCHES_PER_DEVICE);
    await sockets[0].watch(900, 'teachers', 'watchTeachers');
    expect(sockets[0].socket.refusal(900)?.error).toMatchObject({ name: 'SurfaceError', code: 'too-many-watches' });
    await sockets[3].watch(901, 'teachers', 'watchTeachers');
    expect(sockets[3].socket.refusal(901)?.error).toMatchObject({ code: 'too-many-watches' });
    await sockets[1].send({ type: 'unwatch', id: 1 });
    await sockets[2].watch(902, 'teachers', 'watchTeachers');
    expect(sockets[2].socket.refusal(902)).toBeUndefined();
  });

  it('holds the teacher to no cap on reads, sockets or devices', async () => {
    const harness = createHarness();
    await harness.core.seed(true);
    const sockets = Array.from({ length: 3 }, () => connect(harness, 'laptop', FAR));
    for (let id = 1; id <= WATCHES_PER_DEVICE * 2; id += 1) {
      const socket = sockets[id % sockets.length];
      await socket.watch(id, 'teachers', 'watchTeachers');
      expect(socket.socket.refusal(id)).toBeUndefined();
    }
    expect(harness.registry.ofDevice('laptop')).toBe(WATCHES_PER_DEVICE * 2);
  });

  it('stops opening new ones for visitors at 20,000 on the hub, tells the page with the wire error of the watches limit, and opens again as others close; the teacher and a seated student are never stopped', async () => {
    const { harness, admin, session, students } = await classroom();
    const { phone: seated } = await seatFor(harness, admin, session.code, 'seated', students[0].id, students[0].groupId);
    const pages = Array.from({ length: Math.ceil(WATCHES_PER_HUB / WATCHES_PER_DEVICE) + 1 }, (_, n) => connect(harness, `phone-${n}`));
    let opened = harness.registry.inHub();
    for (const page of pages) {
      for (let id = 1; id <= WATCHES_PER_DEVICE && opened < WATCHES_PER_HUB; id += 1, opened += 1) await page.watch(id, 'teachers', 'watchTeachers');
    }
    expect(harness.registry.inHub()).toBe(WATCHES_PER_HUB);
    const last = pages.at(-1)!;
    await last.watch(900, 'teachers', 'watchTeachers');
    expect(last.socket.refusal(900)?.error).toEqual({ name: 'LimitError', code: 'watches' });
    await admin.watch(901, 'teachers', 'watchTeachers');
    expect(admin.socket.refusal(901)).toBeUndefined();
    await seated.watch(902, 'teachers', 'watchTeachers');
    expect(seated.socket.refusal(902)).toBeUndefined();
    await pages[0].send({ type: 'unwatch', id: 1 });
    await pages[0].send({ type: 'unwatch', id: 2 });
    await pages[0].send({ type: 'unwatch', id: 3 });
    await last.watch(903, 'teachers', 'watchTeachers');
    expect(last.socket.refusal(903)).toBeUndefined();
    expect(last.socket.values(903)).toHaveLength(1);
  }, 60_000);
});
