import { describe, expect, it } from 'vitest';
import { LiveConnection, type SocketHandlers, type Timers } from '../infrastructure/remote/LiveConnection';
import { RequestRefused } from '../infrastructure/remote/RequestRefused';
import { CLOSE_DEVICE_LOCKED, CLOSE_RATE_LIMITED, encode, STATUS_NETWORK_FULL } from '../ports/wire';

/** The page's connection against a hub that turns it away: what it says, and how long it waits before trying again. */

class Timeline implements Timers {
  readonly waits: number[] = [];
  private pending: (() => void) | null = null;
  random = () => 0;
  after = (ms: number, work: () => void) => {
    this.waits.push(ms);
    this.pending = work;
    return () => {
      this.pending = null;
    };
  };
  every = () => () => undefined;
  async fire(): Promise<void> {
    const work = this.pending;
    this.pending = null;
    work?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function pageWith(prepare: () => Promise<void>) {
  const timers = new Timeline();
  const sockets: SocketHandlers[] = [];
  const connection = new LiveConnection({
    openSocket: (handlers) => {
      sockets.push(handlers);
      return { send: () => undefined, close: () => undefined };
    },
    prepare,
    onHello: () => undefined,
    timers,
  });
  const wake = async () => {
    void connection.restart();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { connection, timers, sockets, wake };
}

const hello = encode({ type: 'hello', admin: false, now: 0 });

describe('a page the hub turned away', () => {
  it('says it sent too much when the hub closed its socket for that, and waits at least half a minute', async () => {
    const page = pageWith(async () => undefined);
    await page.wake();
    page.sockets[0].message(hello);
    expect(page.connection.isUp()).toBe(true);
    const heard: (string | null)[] = [];
    page.connection.subscribe(() => heard.push(page.connection.turnedAway()));
    page.sockets[0].closed(CLOSE_RATE_LIMITED);
    expect(page.connection.isUp()).toBe(false);
    expect(page.connection.turnedAway()).toBe('rate');
    expect(page.timers.waits).toEqual([30_000]);
    expect(heard).toEqual(['rate']);
  });

  it('says its device is refused when the hub locked it, and when the hello was refused with 429', async () => {
    const locked = pageWith(async () => undefined);
    await locked.wake();
    locked.sockets[0].message(hello);
    locked.sockets[0].closed(CLOSE_DEVICE_LOCKED);
    expect(locked.connection.turnedAway()).toBe('device');
    expect(locked.timers.waits[0]).toBeGreaterThanOrEqual(30_000);

    const refused = pageWith(() => Promise.reject(new RequestRefused('/api/hello', 429)));
    await refused.wake();
    expect(refused.connection.turnedAway()).toBe('device');
    expect(refused.connection.isUp()).toBe(false);
    expect(refused.timers.waits[0]).toBeGreaterThanOrEqual(30_000);
  });

  it('says the network is full, not the device, when the hello was refused because its address has had all its new devices', async () => {
    const full = pageWith(() => Promise.reject(new RequestRefused('/api/hello', STATUS_NETWORK_FULL)));
    await full.wake();
    expect(full.connection.turnedAway()).toBe('network');
    expect(full.timers.waits[0]).toBeGreaterThanOrEqual(30_000);
  });

  it('keeps the ordinary quick retry for any other failure, and says nothing about a limit', async () => {
    const down = pageWith(() => Promise.reject(new RequestRefused('/api/hello', 500)));
    await down.wake();
    expect(down.connection.turnedAway()).toBeNull();
    expect(down.timers.waits).toEqual([250]);
    const dropped = pageWith(async () => undefined);
    await dropped.wake();
    dropped.sockets[0].message(hello);
    dropped.sockets[0].closed(1006);
    expect(dropped.connection.turnedAway()).toBeNull();
    expect(dropped.timers.waits).toEqual([250]);
  });

  it('does not try again sooner than half a minute however often it is refused, and forgets the reason once it is let in', async () => {
    const page = pageWith(() => Promise.reject(new RequestRefused('/api/hello', 429)));
    await page.wake();
    for (let n = 0; n < 10; n += 1) await page.timers.fire();
    expect(page.timers.waits).toHaveLength(11);
    expect(page.timers.waits.every((wait) => wait >= 30_000)).toBe(true);
    const open = pageWith(async () => undefined);
    await open.wake();
    open.sockets[0].closed(CLOSE_RATE_LIMITED);
    await open.timers.fire();
    open.sockets[1].message(hello);
    expect(open.connection.isUp()).toBe(true);
    expect(open.connection.turnedAway()).toBeNull();
  });
});
