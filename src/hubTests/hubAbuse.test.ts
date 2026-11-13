import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDRESS_WRONG_SIGN_INS, DEVICE_FLOODS, DEVICE_MISSES, DEVICE_SEAT_CHANGES, DEVICE_MESSAGES, SOCKETS_PER_DEVICE } from '../ports/limits';
import { CLOSE_DEVICE_LOCKED, CLOSE_RATE_LIMITED, STATUS_TOO_MANY } from '../ports/wire';
import { SqlWindowMemory } from '../infrastructure/sql/windowEvents';
import { Connection } from '../server/Connection';
import { deviceIdOf } from '../server/identity';
import { SignInGuard } from '../server/SignInGuard';
import { connect, createHarness, type Harness } from './hubHarness';
import { hub, jar, post, teacher, upgrade } from './requestsKit';

const MINUTE = 60_000;
const FAR = 9_000_000_000_000;

/** Sends `count` messages that do nothing, one after the other, on one socket. */
async function chatter(client: ReturnType<typeof connect>, count: number): Promise<void> {
  for (let id = 0; id < count; id += 1) await client.send({ type: 'unwatch', id });
}

/** A page that talks too fast from `address`: its socket is closed, and says with what. */
async function flood(harness: Harness, device: string, address: string): Promise<number | undefined> {
  const client = connect(harness, device, null, address);
  await chatter(client, DEVICE_MESSAGES.max + 1);
  return client.socket.closedWith?.code;
}

describe('a socket that sends too fast', () => {
  it('may send 120 messages in ten seconds, and is closed on the next with its own close code', async () => {
    const harness = createHarness();
    const talker = connect(harness, 'phone');
    await chatter(talker, DEVICE_MESSAGES.max);
    expect(talker.socket.closedWith).toBeNull();
    await chatter(talker, 1);
    expect(talker.socket.closedWith).toMatchObject({ code: CLOSE_RATE_LIMITED });
    const calm = connect(harness, 'phone2');
    await chatter(calm, 5);
    expect(calm.socket.closedWith).toBeNull();
  });

  it('counts the messages of a device over all its sockets, not of each socket alone', async () => {
    const harness = createHarness();
    const pages = Array.from({ length: SOCKETS_PER_DEVICE }, () => connect(harness, 'phone', null, '10.0.0.3'));
    const each = DEVICE_MESSAGES.max / SOCKETS_PER_DEVICE;
    for (const page of pages) await chatter(page, each);
    expect(pages.every((page) => page.socket.closedWith === null)).toBe(true);
    await chatter(pages[0], 1);
    expect(pages[0].socket.closedWith).toMatchObject({ code: CLOSE_RATE_LIMITED });
    expect(connect(harness, 'another phone', null, '10.0.0.3').socket.closedWith).toBeNull();
  });

  it('answers nothing more once closed, even to a call that came in after', async () => {
    const harness = createHarness();
    await harness.core.seed(true);
    const talker = connect(harness, 'phone');
    await chatter(talker, DEVICE_MESSAGES.max + 1);
    await talker.send({ type: 'call', id: 500, service: 'teachers', method: 'watchTeachers', args: [] });
    expect(talker.socket.result(500)).toBeUndefined();
  });

  it('counts the messages of the last ten seconds only, so a steady page is never closed', async () => {
    const harness = createHarness();
    const steady = connect(harness, 'phone');
    for (let round = 0; round < 5; round += 1) {
      await chatter(steady, DEVICE_MESSAGES.max);
      harness.clock.now += DEVICE_MESSAGES.windowMs;
    }
    expect(steady.socket.closedWith).toBeNull();
  });

  it('counts a strike against the device each time, and the third locks that device and closes that socket with the lock’s code', async () => {
    const harness = createHarness();
    expect(await flood(harness, 'a', '10.0.0.5')).toBe(CLOSE_RATE_LIMITED);
    expect(await flood(harness, 'a', '10.0.0.5')).toBe(CLOSE_RATE_LIMITED);
    expect(harness.gate.turnsAway('a', false)).toBe(false);
    expect(await flood(harness, 'a', '10.0.0.5')).toBe(CLOSE_DEVICE_LOCKED);
    expect(harness.gate.turnsAway('a', false)).toBe(true);
    expect(harness.gate.turnsAway('a', true)).toBe(false);
    expect(harness.gate.turnsAway('b', false)).toBe(false);
  });

  it('forgets a strike after ten minutes, so slow offences never add up to a lock', async () => {
    const harness = createHarness();
    for (let round = 0; round < 4; round += 1) {
      await flood(harness, 'a', '10.0.0.7');
      harness.clock.now += DEVICE_FLOODS.windowMs;
    }
    expect(harness.gate.turnsAway('a', false)).toBe(false);
  });

  it('closes the teacher’s socket when it floods, but never strikes it and never locks anything', async () => {
    const harness = createHarness();
    for (let round = 0; round < 6; round += 1) {
      const teacherPage = connect(harness, 'laptop', FAR, '10.0.0.8');
      await chatter(teacherPage, DEVICE_MESSAGES.max + 1);
      expect(teacherPage.socket.closedWith).toMatchObject({ code: CLOSE_RATE_LIMITED });
    }
    expect(harness.gate.turnsAway('laptop', false)).toBe(false);
    expect(harness.sql.all('SELECT subject FROM locks')).toEqual([]);
    expect(await flood(harness, 'laptop', '10.0.0.8')).toBe(CLOSE_RATE_LIMITED);
  });
});

describe('a device that is locked', () => {
  const from = (address: string, headers: Record<string, string> = {}) => ({ 'CF-Connecting-IP': address, ...headers });

  /** A hub, and a device it issued a cookie to, which then floods three times from `address`. */
  async function lockedHub(address = '10.0.0.5') {
    const h = await hub();
    const cookie = jar(await h.requests.handle(post('/api/hello', undefined, from(address))));
    const device = await deviceIdOf(cookie.split('=')[1]);
    for (let strike = 0; strike < DEVICE_FLOODS.max; strike += 1) await flood(h.harness, device, address);
    return { h, cookie, device };
  }

  it('is refused a new socket and a hello, with a bare 429, while another device at the same address is not', async () => {
    const { h, cookie } = await lockedHub();
    const neighbour = jar(await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5'))));
    const hello = await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5', { Cookie: cookie })));
    const socket = await h.requests.handle(upgrade(from('10.0.0.5', { Cookie: cookie })));
    for (const refused of [hello, socket]) {
      expect(refused.status).toBe(STATUS_TOO_MANY);
      expect(await refused.text()).toBe('');
    }
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5', { Cookie: neighbour })))).status).toBe(200);
    expect((await h.requests.handle(upgrade(from('10.0.0.5', { Cookie: neighbour })))).status).toBe(200);
    expect((await h.requests.handle(upgrade(from('10.0.0.6', { Cookie: cookie })))).status).toBe(STATUS_TOO_MANY);
  });

  it('does not stop the other devices of a school from opening sockets after three floods from one of them', async () => {
    const h = await hub();
    const flooder = await deviceIdOf(jar(await h.requests.handle(post('/api/hello', undefined, from('10.2.2.2')))).split('=')[1]);
    for (let strike = 0; strike < DEVICE_FLOODS.max; strike += 1) await flood(h.harness, flooder, '10.2.2.2');
    for (let n = 0; n < 35; n += 1) {
      const cookie = jar(await h.requests.handle(post('/api/hello', undefined, from('10.2.2.2'))));
      expect((await h.requests.handle(upgrade(from('10.2.2.2', { Cookie: cookie })))).status).toBe(200);
    }
  });

  it('lets the teacher in on it, if she holds a valid teacher cookie', async () => {
    const h = await hub();
    const { cookie } = await teacher(h, '10.0.0.1');
    const device = await deviceIdOf(cookie.split(';')[0].split('=')[1]);
    for (let strike = 0; strike < DEVICE_FLOODS.max; strike += 1) await flood(h.harness, device, '10.0.0.1');
    expect(h.harness.gate.turnsAway(device, false)).toBe(true);
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.1', { Cookie: cookie })))).status).toBe(200);
    expect((await h.requests.handle(upgrade(from('10.0.0.1', { Cookie: cookie })))).status).toBe(200);
    expect(h.sockets.at(-1)?.messages()[0]).toMatchObject({ type: 'hello', admin: true });
  });

  it('ends by itself after ten minutes', async () => {
    const { h, cookie } = await lockedHub();
    h.harness.clock.now += DEVICE_FLOODS.lockMs - 1;
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5', { Cookie: cookie })))).status).toBe(STATUS_TOO_MANY);
    h.harness.clock.now += 1;
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5', { Cookie: cookie })))).status).toBe(200);
  });

  it('is shed by a restart, and costs the database nothing: the device could drop its cookie as well', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'noha-pearls-lock-'));
    try {
      const file = join(folder, 'hub.sqlite');
      const before = createHarness(file);
      for (let strike = 0; strike < DEVICE_FLOODS.max; strike += 1) await flood(before, 'a', '10.0.0.5');
      expect(before.gate.turnsAway('a', false)).toBe(true);
      expect(before.sql.all('SELECT subject FROM locks')).toEqual([]);
      expect(createHarness(file).gate.turnsAway('a', false)).toBe(false);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('costs a hub that starts again no row to read, however many devices were locked, while a sign-in lock still holds', () => {
    const folder = mkdtempSync(join(tmpdir(), 'noha-pearls-lock-'));
    try {
      const file = join(folder, 'hub.sqlite');
      const before = createHarness(file);
      for (let device = 0; device < 500; device += 1) {
        const guard = before.gate.limitsFor('10.0.0.5', `bot-${device}`, async () => false).guard;
        for (let miss = 0; miss < DEVICE_MISSES.max; miss += 1) guard.recordMiss();
        expect(guard.lookupAllowed()).toBe(false);
      }
      const signIns = new SignInGuard(before.locks, new SqlWindowMemory(before.meter), () => before.clock.now);
      for (let attempt = 0; attempt < ADDRESS_WRONG_SIGN_INS.max; attempt += 1) {
        signIns.begin('10.0.0.9');
        signIns.finish('10.0.0.9', 'wrong-password');
      }
      const after = createHarness(file);
      after.sql.reset();
      const awake = new SignInGuard(after.locks, new SqlWindowMemory(after.meter), () => after.clock.now);
      expect(after.sql.rowsRead).toBe(0);
      expect(awake.begin('10.0.0.9')).toBe(false);
      expect(awake.begin('10.0.0.10')).toBe(true);
      expect(after.sql.rowsRead).toBeLessThanOrEqual(4);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('is forgotten by the hub’s alarm once it has ended, and not before', async () => {
    const harness = createHarness();
    await harness.core.seed(true);
    for (let strike = 0; strike < DEVICE_FLOODS.max; strike += 1) await flood(harness, 'a', '10.0.0.5');
    await harness.core.runAlarm();
    expect(harness.gate.turnsAway('a', false)).toBe(true);
    harness.clock.now += DEVICE_FLOODS.lockMs;
    await harness.core.runAlarm();
    expect(harness.gate.turnsAway('a', false)).toBe(false);
  });
});

describe('the guard a connection gives the services', () => {
  const guardOf = (harness: Harness, address: string, device = 'phone') => harness.gate.limitsFor(address, device, async () => false).guard;

  it('locks a device out of looking codes up for ten minutes after its twenty-first wrong one, and no other device, whatever its address', () => {
    const harness = createHarness();
    const guard = guardOf(harness, '10.0.0.1');
    for (let miss = 0; miss < DEVICE_MISSES.max; miss += 1) {
      expect(guard.lookupAllowed()).toBe(true);
      guard.recordMiss();
    }
    expect(guard.lookupAllowed()).toBe(false);
    expect(guardOf(harness, '10.0.0.1', 'another phone').lookupAllowed()).toBe(true);
    expect(guardOf(harness, '10.0.0.2').lookupAllowed()).toBe(false);
    harness.clock.now += DEVICE_MISSES.lockMs - 1;
    expect(guard.lookupAllowed()).toBe(false);
    harness.clock.now += 1;
    expect(guard.lookupAllowed()).toBe(true);
    for (let miss = 0; miss < DEVICE_MISSES.max - 1; miss += 1) guard.recordMiss();
    expect(guard.lookupAllowed()).toBe(true);
  });

  it('forgets wrong codes after ten minutes, so slow guessing is not a lock', () => {
    const harness = createHarness();
    const guard = guardOf(harness, '10.0.0.1');
    for (let round = 0; round < 4; round += 1) {
      for (let miss = 0; miss < 15; miss += 1) guard.recordMiss();
      harness.clock.now += 11 * MINUTE;
    }
    expect(guard.lookupAllowed()).toBe(true);
  });

  it('lets a device change its seat six times an hour across all its sockets, then refuses, without counting what it refuses', () => {
    const harness = createHarness();
    const [first, second] = [guardOf(harness, '10.0.0.1', 'phone'), guardOf(harness, '10.0.0.1', 'phone')];
    const changes = Array.from({ length: DEVICE_SEAT_CHANGES.max + 2 }, (_, n) => (n % 2 === 0 ? first : second).seatChangeAllowed());
    expect(changes).toEqual([...Array(DEVICE_SEAT_CHANGES.max).fill(true), false, false]);
    expect(guardOf(harness, '10.0.0.1', 'tablet').seatChangeAllowed()).toBe(true);
    harness.clock.now += DEVICE_SEAT_CHANGES.windowMs / 2;
    expect(first.seatChangeAllowed()).toBe(false);
    harness.clock.now += DEVICE_SEAT_CHANGES.windowMs / 2;
    expect(first.seatChangeAllowed()).toBe(true);
  });

  it('is given to the connection by its address and device, and survives a hibernation with the address kept', async () => {
    const harness = createHarness();
    const phone = connect(harness, 'phone', null, '10.0.0.77');
    const attached = phone.socket.deserializeAttachment() as { address: string };
    expect(attached.address).toBe('10.0.0.77');
    const woken = Connection.restore(phone.socket, harness.core) as Connection;
    expect(woken.address()).toBe('10.0.0.77');
  });
});
