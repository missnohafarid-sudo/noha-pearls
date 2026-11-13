import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDRESS_LOCK_MS, ADDRESS_STRIKES, DEVICE_JOINS, LOOKUP_LOCK_MS, SCHOOL_MISSES, SOCKET_CARDS, SOCKET_MESSAGES, WATCHES_PER_HUB } from '../ports/limits';
import { CLOSE_ADDRESS_LOCKED, CLOSE_RATE_LIMITED, STATUS_TOO_MANY } from '../ports/wire';
import { Connection } from '../server/Connection';
import { connect, createHarness, FakeSocket, type Harness } from './hubHarness';
import { hub, jar, post, teacher, upgrade } from './requestsKit';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const FAR = 9_000_000_000_000;

/** Sends `count` messages that do nothing, one after the other, on one socket. */
async function chatter(client: ReturnType<typeof connect>, count: number): Promise<void> {
  for (let id = 0; id < count; id += 1) await client.send({ type: 'unwatch', id });
}

/** A page that talks too fast from `address`: its socket is closed, and says with what. */
async function flood(harness: Harness, device: string, address: string): Promise<number | undefined> {
  const client = connect(harness, device, null, address);
  await chatter(client, SOCKET_MESSAGES.max + 1);
  return client.socket.closedWith?.code;
}

describe('a socket that sends too fast', () => {
  it('may send 120 messages in ten seconds, and is closed on the next with its own close code', async () => {
    const harness = createHarness();
    const talker = connect(harness, 'phone');
    await chatter(talker, SOCKET_MESSAGES.max);
    expect(talker.socket.closedWith).toBeNull();
    await chatter(talker, 1);
    expect(talker.socket.closedWith).toMatchObject({ code: CLOSE_RATE_LIMITED });
    const calm = connect(harness, 'phone2');
    await chatter(calm, 5);
    expect(calm.socket.closedWith).toBeNull();
  });

  it('answers nothing more once closed, even to a call that came in after', async () => {
    const harness = createHarness();
    await harness.core.seed();
    const talker = connect(harness, 'phone');
    await chatter(talker, SOCKET_MESSAGES.max + 1);
    await talker.send({ type: 'call', id: 500, service: 'teachers', method: 'watchTeachers', args: [] });
    expect(talker.socket.result(500)).toBeUndefined();
  });

  it('counts the messages of the last ten seconds only, so a steady page is never closed', async () => {
    const harness = createHarness();
    const steady = connect(harness, 'phone');
    for (let round = 0; round < 5; round += 1) {
      await chatter(steady, SOCKET_MESSAGES.max);
      harness.clock.now += SOCKET_MESSAGES.windowMs;
    }
    expect(steady.socket.closedWith).toBeNull();
  });

  it('counts a strike against the address each time, and the third locks the address and closes that socket with the lock’s code', async () => {
    const harness = createHarness();
    expect(await flood(harness, 'a', '10.0.0.5')).toBe(CLOSE_RATE_LIMITED);
    expect(await flood(harness, 'b', '10.0.0.5')).toBe(CLOSE_RATE_LIMITED);
    expect(harness.gate.turnsAway('10.0.0.5', null)).toBe(false);
    expect(await flood(harness, 'c', '10.0.0.5')).toBe(CLOSE_ADDRESS_LOCKED);
    expect(harness.gate.turnsAway('10.0.0.5', null)).toBe(true);
    expect(harness.gate.turnsAway('10.0.0.6', null)).toBe(false);
  });

  it('forgets a strike after ten minutes, so slow offences never add up to a lock', async () => {
    const harness = createHarness();
    for (const device of ['a', 'b', 'c', 'd']) {
      await flood(harness, device, '10.0.0.7');
      harness.clock.now += ADDRESS_STRIKES.windowMs;
    }
    expect(harness.gate.turnsAway('10.0.0.7', null)).toBe(false);
  });
});

describe('an address that is locked', () => {
  async function lockedHub(address = '10.0.0.5') {
    const h = await hub();
    for (const device of ['a', 'b', 'c']) await flood(h.harness, device, address);
    return h;
  }
  const from = (address: string, headers: Record<string, string> = {}) => ({ 'CF-Connecting-IP': address, ...headers });

  it('is refused a new socket and a hello, with a bare 429, while another address is not', async () => {
    const h = await lockedHub();
    const known = jar(await h.requests.handle(post('/api/hello', undefined, from('10.0.0.9'))));
    const hello = await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5')));
    const socket = await h.requests.handle(upgrade(from('10.0.0.5', { Cookie: known })));
    for (const refused of [hello, socket]) {
      expect(refused.status).toBe(STATUS_TOO_MANY);
      expect(await refused.text()).toBe('');
    }
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.6')))).status).toBe(200);
    expect((await h.requests.handle(upgrade(from('10.0.0.6', { Cookie: known })))).status).toBe(200);
  });

  it('lets the teacher in from it, if she holds a valid teacher cookie', async () => {
    const h = await lockedHub('10.0.0.1');
    const { cookie } = await teacher(h, '10.0.0.1');
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.1', { Cookie: cookie })))).status).toBe(200);
    expect((await h.requests.handle(upgrade(from('10.0.0.1', { Cookie: cookie })))).status).toBe(200);
    expect(h.sockets.at(-1)?.messages()[0]).toMatchObject({ type: 'hello', admin: true });
  });

  it('ends by itself after ten minutes', async () => {
    const h = await lockedHub();
    h.harness.clock.now += ADDRESS_LOCK_MS - 1;
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5')))).status).toBe(STATUS_TOO_MANY);
    h.harness.clock.now += 1;
    expect((await h.requests.handle(post('/api/hello', undefined, from('10.0.0.5')))).status).toBe(200);
  });

  it('is still locked after the hub restarts, because the lock is kept in the database', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'noha-pearls-lock-'));
    try {
      const file = join(folder, 'hub.sqlite');
      const before = createHarness(file);
      for (const device of ['a', 'b', 'c']) await flood(before, device, '10.0.0.5');
      const after = createHarness(file);
      expect(after.gate.turnsAway('10.0.0.5', null)).toBe(true);
      expect(after.gate.turnsAway('10.0.0.6', null)).toBe(false);
      const later = createHarness(file);
      later.clock.now += ADDRESS_LOCK_MS;
      expect(later.gate.turnsAway('10.0.0.5', null)).toBe(false);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('is forgotten from the database by the hub’s alarm once it has ended, and not before', async () => {
    const harness = createHarness();
    await harness.core.seed();
    for (const device of ['a', 'b', 'c']) await flood(harness, device, '10.0.0.5');
    const stored = () => harness.sql.all<{ address: string }>('SELECT address FROM address_locks').map((row) => row.address);
    await harness.core.runAlarm();
    expect(stored()).toEqual(['10.0.0.5']);
    harness.clock.now += ADDRESS_LOCK_MS;
    await harness.core.runAlarm();
    expect(stored()).toEqual([]);
  });
});

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
    expect(woken.gate.admits(counts)).toBe(false);
  });

  it('holds at most 400 for one address, and the next address is not affected', async () => {
    const h = await hub();
    const open = async (n: number) => (await h.requests.handle(upgrade({ 'CF-Connecting-IP': '10.9.9.9', Cookie: await cookieFor(h, `issuer-${n}`) }))).status;
    for (let n = 0; n < 400; n += 1) expect(await open(n)).toBe(200);
    expect(await open(400)).toBe(STATUS_TOO_MANY);
    expect((await h.requests.handle(upgrade({ 'CF-Connecting-IP': '10.9.9.8', Cookie: await cookieFor(h, 'other') }))).status).toBe(200);
  });

  it('holds at most 3000 altogether', async () => {
    const h = await hub();
    const open = async (n: number) => (await h.requests.handle(upgrade({ 'CF-Connecting-IP': `10.${n % 250}.${Math.floor(n / 250)}.1`, Cookie: await cookieFor(h, `issuer-${n}`) }))).status;
    for (let n = 0; n < 3000; n += 1) await open(n);
    expect(h.sockets).toHaveLength(3000);
    expect(await open(3000)).toBe(STATUS_TOO_MANY);
    expect(h.sockets).toHaveLength(3000);
  });
});

describe('the live reads the hub holds', () => {
  it('stops opening new ones at 20,000 on the hub, tells the page with the wire error of the watches limit, and opens again as others close', async () => {
    const harness = createHarness();
    await harness.core.seed();
    const pages = Array.from({ length: Math.ceil(WATCHES_PER_HUB / 48) + 1 }, (_, n) => connect(harness, `phone-${n}`));
    let opened = 0;
    for (const page of pages) {
      for (let id = 1; id <= 48 && opened < WATCHES_PER_HUB; id += 1, opened += 1) await page.watch(id, 'teachers', 'watchTeachers');
    }
    expect(harness.registry.watchCount()).toBe(WATCHES_PER_HUB);
    const last = pages.at(-1)!;
    await last.watch(900, 'teachers', 'watchTeachers');
    expect(last.socket.refusal(900)?.error).toEqual({ name: 'LimitError', code: 'watches' });
    await pages[0].send({ type: 'unwatch', id: 1 });
    await last.watch(901, 'teachers', 'watchTeachers');
    expect(last.socket.refusal(901)).toBeUndefined();
    expect(last.socket.values(901)).toHaveLength(1);
  }, 60_000);
});

describe('the guard a connection gives the services', () => {
  const guardOf = (harness: Harness, address: string, device = 'phone') => harness.gate.limitsFor(address, device).guard;

  it('locks an address out of looking codes up for ten minutes after more than twenty wrong ones, and no other address', () => {
    const harness = createHarness();
    const guard = guardOf(harness, '10.0.0.1');
    for (let miss = 0; miss < 20; miss += 1) {
      expect(guard.lookupAllowed()).toBe(true);
      guard.recordMiss();
    }
    expect(guard.lookupAllowed()).toBe(true);
    guard.recordMiss();
    expect(guard.lookupAllowed()).toBe(false);
    expect(guardOf(harness, '10.0.0.1', 'another phone').lookupAllowed()).toBe(false);
    expect(guardOf(harness, '10.0.0.2').lookupAllowed()).toBe(true);
    harness.clock.now += LOOKUP_LOCK_MS - 1;
    expect(guard.lookupAllowed()).toBe(false);
    harness.clock.now += 1;
    expect(guard.lookupAllowed()).toBe(true);
    for (let miss = 0; miss < 20; miss += 1) guard.recordMiss();
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

  it('closes lookups for everyone once the school has had more than 3,000 wrong codes in an hour', () => {
    const harness = createHarness();
    for (let miss = 0; miss <= SCHOOL_MISSES.max; miss += 1) {
      expect(guardOf(harness, `10.1.${Math.floor(miss / 15)}.1`).lookupAllowed()).toBe(true);
      guardOf(harness, `10.1.${Math.floor(miss / 15)}.1`).recordMiss();
    }
    expect(guardOf(harness, '10.9.9.9').lookupAllowed()).toBe(false);
    harness.clock.now += HOUR;
    expect(guardOf(harness, '10.9.9.9').lookupAllowed()).toBe(true);
  });

  it('lets a device join ten times a minute across all its sockets, then refuses, without counting what it refuses', () => {
    const harness = createHarness();
    const [first, second] = [guardOf(harness, '10.0.0.1', 'phone'), guardOf(harness, '10.0.0.1', 'phone')];
    const joins = Array.from({ length: DEVICE_JOINS.max + 2 }, (_, n) => (n % 2 === 0 ? first : second).joinAllowed());
    expect(joins).toEqual([...Array(DEVICE_JOINS.max).fill(true), false, false]);
    expect(guardOf(harness, '10.0.0.1', 'tablet').joinAllowed()).toBe(true);
    harness.clock.now += DEVICE_JOINS.windowMs / 2;
    expect(first.joinAllowed()).toBe(false);
    harness.clock.now += DEVICE_JOINS.windowMs / 2;
    expect(first.joinAllowed()).toBe(true);
  });

  it('keeps a budget of new card numbers for each socket, frees a card already shown, and gives the room back after five minutes', () => {
    const harness = createHarness();
    const socket = guardOf(harness, '10.0.0.1');
    for (let card = 0; card < SOCKET_CARDS.max; card += 1) expect(socket.cardAllowed(card)).toBe(true);
    expect(socket.cardAllowed(SOCKET_CARDS.max)).toBe(false);
    expect(socket.cardAllowed(3)).toBe(true);
    expect(guardOf(harness, '10.0.0.1').cardAllowed(SOCKET_CARDS.max)).toBe(true);
    harness.clock.now += SOCKET_CARDS.windowMs + 1;
    expect(socket.cardAllowed(SOCKET_CARDS.max)).toBe(true);
  });

  it('is given to the connection by its address and device, and survives a hibernation with the address kept', async () => {
    const harness = createHarness();
    const phone = connect(harness, 'phone', null, '10.0.0.77');
    const attached = phone.socket.deserializeAttachment() as { address: string };
    expect(attached.address).toBe('10.0.0.77');
    const woken = Connection.restore(phone.socket, harness.core) as Connection;
    expect(woken.address()).toBe('10.0.0.77');
    const oldSocket = new FakeSocket();
    oldSocket.serializeAttachment({ device: 'old', adminExpiresAt: FAR, watches: [] });
    expect((Connection.restore(oldSocket, harness.core) as Connection).address()).toBe('local');
  });
});
