import { describe, expect, it } from 'vitest';
import type { Teacher } from '../domain/models';
import { createHarness, type Harness } from './hubHarness';
import { LiveConnection, type SocketFactory, type Timers } from '../infrastructure/remote/LiveConnection';
import { RemoteSession, type PostJson } from '../infrastructure/remote/RemoteSession';
import { PING, PONG, SIGN_IN_PATH, SIGN_OUT_PATH, HELLO_PATH } from '../ports/wire';
import { NotAuthorizedError } from '../services/AuthService';
import { SurfaceError } from '../services/surfaceDispatch';
import { LOCAL_ADDRESS } from '../server/address';
import { ConnectionRegistry } from '../server/ConnectionRegistry';
import type { RefusableListener } from '../ports/remote';
import { ConnectionLostError, ServiceFailure } from '../services/errorRegistry';
import { NameError } from '../services/requireName';
import { RosterError } from '../services/RosterService';
import { createRemoteServices } from '../services/remoteServices';
import type { HubSocket } from '../server/Connection';
import { Connection } from '../server/Connection';

const FAR = 9_000_000_000_000;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The page and the real hub joined in one process: what one sends the other receives, in order, a tick later. */
class Wire {
  identity: { device: string; admin: boolean; adminExpiresAt: number } = { device: 'phone', admin: false, adminExpiresAt: FAR };
  sockets: { page: { message(text: string): void; closed(): void }; hub: Connection; closeFromHub(): void }[] = [];
  opened = 0;
  answerPings = true;

  constructor(
    private readonly harness: Harness,
    readonly registry = new ConnectionRegistry<object>(),
  ) {}

  factory: SocketFactory = (handlers) => {
    this.opened += 1;
    let open = true;
    const toPage = (text: string) => void Promise.resolve().then(() => open && handlers.message(text));
    const hubSide: HubSocket = {
      send: toPage,
      close: () => {
        open = false;
        hub.close();
        handlers.closed();
      },
      serializeAttachment: () => undefined, deserializeAttachment: () => null };
    const { device, admin, adminExpiresAt } = this.identity;
    const hub = Connection.open(hubSide, this.harness.core, { device, adminExpiresAt: admin ? adminExpiresAt : null, address: LOCAL_ADDRESS });
    this.registry.add(hubSide, hub);
    this.sockets.push({
      page: handlers,
      hub,
      closeFromHub: () => {
        open = false;
        hub.close();
        handlers.closed();
      },
    });
    return {
      send: (text) => {
        if (!open) return;
        if (text === PING) return this.answerPings ? toPage(PONG) : undefined;
        void hub.receive(text);
      },
      close: () => {
        open = false;
        hub.close();
      },
    };
  };

  dropLatest = () => this.sockets.at(-1)?.closeFromHub();
}

class Clock implements Timers {
  private nextHandle = 1;
  readonly waiting = new Map<number, { work: () => void; ms: number; repeat: boolean }>();
  after = (ms: number, work: () => void) => this.add(ms, work, false);
  every = (ms: number, work: () => void) => this.add(ms, work, true);
  random = () => 1;

  private add(ms: number, work: () => void, repeat: boolean) {
    const handle = this.nextHandle++;
    this.waiting.set(handle, { work, ms, repeat });
    return () => void this.waiting.delete(handle);
  }

  /** Runs every one-time timer that is waiting, and (if asked) the repeating ones once. */
  async fire(repeating = false) {
    for (const [handle, timer] of [...this.waiting]) {
      if (timer.repeat !== repeating) continue;
      if (!timer.repeat) this.waiting.delete(handle);
      timer.work();
    }
    await flush();
  }

  delays = () => [...this.waiting.values()].filter((timer) => !timer.repeat).map((timer) => timer.ms);
}

interface PageOptions {
  admin?: boolean;
  answerPings?: boolean;
  /** Another page of the same school: the hub it talks to, and the device cookie jar it shares. */
  sameHubAs?: { harness: Harness; wire: Wire };
  adminExpiresAt?: number;
}

async function page(options: PageOptions = {}) {
  const harness = options.sameHubAs?.harness ?? createHarness();
  if (!options.sameHubAs) await harness.core.seed(true);
  const wire = new Wire(harness, options.sameHubAs?.wire.registry);
  if (options.sameHubAs) wire.identity = options.sameHubAs.wire.identity;
  wire.identity.admin = options.admin ?? wire.identity.admin;
  wire.identity.adminExpiresAt = options.adminExpiresAt ?? wire.identity.adminExpiresAt;
  wire.answerPings = options.answerPings ?? true;
  const clock = new Clock();
  const events: string[] = [];
  const session: RemoteSession = new RemoteSession(
    async (path) => {
      events.push(path);
      if (path === HELLO_PATH) return { admin: wire.identity.admin && wire.identity.adminExpiresAt > harness.clock.now, now: harness.clock.now };
      if (path === SIGN_IN_PATH) return { ok: true };
      if (path === SIGN_OUT_PATH) wire.registry.closeDevice(wire.identity.device);
      return {};
    },
    () => connection.restart(),
  );
  const connection: LiveConnection = new LiveConnection({
    openSocket: (handlers) => {
      events.push('socket');
      return wire.factory(handlers);
    },
    prepare: () => session.hello(),
    onHello: (hello) => session.learn(hello),
    timers: clock,
  });
  await connection.restart();
  const services = createRemoteServices(connection, () => session.now());
  return { harness, wire, clock, events, session, connection, services };
}

describe('the page talking to the hub', () => {
  it('asks who it is before it opens the socket, and is up after the hub says hello', async () => {
    const { events, connection, session } = await page();
    expect(events.slice(0, 2)).toEqual([HELLO_PATH, 'socket']);
    expect(connection.isUp()).toBe(true);
    expect(session.isAdmin()).toBe(false);
  });

  it('gives the services a stub that sends commands and returns the hub’s value', async () => {
    const { services } = await page({ admin: true });
    const added = (await services.teachers.add('Huda')) as Teacher;
    expect(added.name).toBe('Huda');
  });

  it('brings back the same error classes the services threw', async () => {
    const admin = await page({ admin: true });
    await expect(admin.services.teachers.add('   ')).rejects.toBeInstanceOf(NameError);
    await expect(admin.services.roster.addGroup('missing', 'x')).rejects.toBeInstanceOf(RosterError);
    const visitor = await page();
    await expect(visitor.services.teachers.add('x')).rejects.toBeInstanceOf(NotAuthorizedError);
    visitor.harness.sql.reset();
    visitor.harness.sql.failOnStatement = 1;
    const failure = await visitor.services.content.updateSite({ id: 'site', schoolName: 'a', title: 'b', tagline: 'c', intro: 'd' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(NotAuthorizedError);
    const admin2 = await page({ admin: true });
    admin2.harness.sql.reset();
    admin2.harness.sql.failOnStatement = 1;
    await expect(admin2.services.teachers.add('x')).rejects.toBeInstanceOf(ServiceFailure);
  });

  it('delivers live values, and a change another device made, until it stops watching', async () => {
    const { services, harness } = await page();
    const seen: Teacher[][] = [];
    const stop = services.teachers.watchTeachers((teachers) => seen.push(teachers));
    await flush();
    expect(seen).toHaveLength(1);
    await harness.store.put('teachers', { id: 't9', name: 'New', order: 9 });
    await flush();
    expect(seen.at(-1)).toHaveLength(2);
    stop();
    await flush();
    await harness.store.put('teachers', { id: 't10', name: 'Later', order: 10 });
    await flush();
    expect(seen).toHaveLength(2);
  });

  it('answers the two methods that read nothing without asking the hub', async () => {
    const { services, harness, events } = await page();
    const before = harness.sql.statements;
    expect(services.lessons.exportToText({ id: 'l', folderId: null, title: 'T', subject: '', grade: '', published: false, slides: [], updatedAt: 0 })).toContain('T');
    expect(services.records.currentPeriod('week')).toMatchObject({ kind: 'week' });
    expect(harness.sql.statements).toBe(before);
    expect(events.filter((event) => event === 'socket')).toHaveLength(1);
  });

  it('reads the hub’s clock, not its own', async () => {
    const { session } = await page();
    session.learn({ admin: false, now: Date.now() + 3_600_000 });
    expect(session.now() - Date.now()).toBeGreaterThan(3_599_000);
  });
});

describe('when the connection drops', () => {
  it('fails a call in flight with a lost connection, reports down, and fails new calls at once', async () => {
    const { services, wire, connection } = await page({ admin: true });
    const pending = services.teachers.add('Huda').catch((error: unknown) => error);
    wire.dropLatest();
    expect(await pending).toBeInstanceOf(ConnectionLostError);
    expect(connection.isUp()).toBe(false);
    await expect(services.teachers.add('Again')).rejects.toBeInstanceOf(ConnectionLostError);
  });

  it('opens again with backoff, sends every live read again, and says it is up', async () => {
    const { services, wire, clock, harness, connection } = await page();
    const seen: Teacher[][] = [];
    services.teachers.watchTeachers((teachers) => seen.push(teachers));
    await flush();
    const notices: boolean[] = [];
    connection.subscribe(() => notices.push(connection.isUp()));
    wire.dropLatest();
    await harness.store.put('teachers', { id: 't9', name: 'While away', order: 9 });
    expect(clock.delays()).toEqual([500]);
    await clock.fire();
    expect(connection.isUp()).toBe(true);
    expect(seen.at(-1)?.map((teacher) => teacher.name)).toContain('While away');
    expect(notices).toEqual([false, true]);
  });

  it('waits longer each time and no longer than fifteen seconds', async () => {
    const { wire, clock, connection } = await page();
    const delays: number[] = [];
    const failingFactory = connection as unknown as { deps: { prepare: () => Promise<void> } };
    failingFactory.deps.prepare = () => Promise.reject(new Error('down'));
    wire.dropLatest();
    for (let n = 0; n < 8; n += 1) {
      delays.push(...clock.delays());
      await clock.fire();
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });

  it('takes a socket that answers nothing to a ping as gone, and opens a new one', async () => {
    const { wire, clock, connection } = await page({ answerPings: false });
    await clock.fire(true);
    expect(connection.isUp()).toBe(true);
    await clock.fire(true);
    expect(connection.isUp()).toBe(false);
    await clock.fire();
    expect(wire.opened).toBe(2);
  });

  it('lets a call made while the socket is opening wait for it', async () => {
    const harness = createHarness();
    await harness.core.seed(true);
    const wire = new Wire(harness);
    wire.identity.admin = true;
    const clock = new Clock();
    const connection: LiveConnection = new LiveConnection({ openSocket: wire.factory, prepare: () => Promise.resolve(), onHello: () => undefined, timers: clock });
    const opening = connection.restart();
    const outcome = connection.call('teachers', 'add', ['Early']);
    await opening;
    expect(await outcome).toMatchObject({ ok: true });
  });
});

describe('signing in and out', () => {
  it('reopens the socket so the new identity applies, and tells everyone who follows the sign-in', async () => {
    const { wire, session, events, services } = await page();
    const changes: boolean[] = [];
    session.subscribe(() => changes.push(session.isAdmin()));
    wire.identity.admin = true;
    expect(await session.signIn({ password: 'x', code: '1' })).toBe(true);
    expect(session.isAdmin()).toBe(true);
    expect(changes).toEqual([true]);
    expect(events.filter((event) => event === 'socket')).toHaveLength(2);
    expect(await services.teachers.add('Now allowed')).toMatchObject({ name: 'Now allowed' });
    wire.identity.admin = false;
    await session.signOut();
    expect(events).toContain(SIGN_OUT_PATH);
    expect(session.isAdmin()).toBe(false);
    await expect(services.teachers.add('Not any more')).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('does not reopen the socket for a refused sign-in', async () => {
    const { session, events } = await page();
    const refusing = new RemoteSession((async () => ({ ok: false })) as PostJson, async () => { events.push('reopened'); });
    expect(await refusing.signIn({ password: 'x', code: '1' })).toBe(false);
    expect(events).not.toContain('reopened');
    expect(session.isAdmin()).toBe(false);
  });

  it('learns from the hub when the teacher’s session ran out', async () => {
    const { session } = await page({ admin: true });
    expect(session.isAdmin()).toBe(true);
    session.learn({ admin: false, now: 0 });
    expect(session.isAdmin()).toBe(false);
  });
});

describe('when the hub closes a socket because the identity behind it changed', () => {
  it('has the device’s other tab reconnect as a visitor after the teacher signed out in one tab, and its public reads work again', async () => {
    const first = await page({ admin: true });
    first.wire.identity.device = 'laptop';
    const second = await page({ admin: true, sameHubAs: first });
    const seen: Teacher[][] = [];
    second.services.teachers.watchTeachers((teachers) => seen.push(teachers));
    await flush();
    expect(seen).toHaveLength(1);
    expect(second.session.isAdmin()).toBe(true);

    first.wire.identity.admin = false;
    await first.session.signOut();
    expect(second.connection.isUp()).toBe(false);
    await second.clock.fire();
    expect(second.connection.isUp()).toBe(true);
    expect(second.session.isAdmin()).toBe(false);
    await expect(second.services.teachers.add('Not any more')).rejects.toBeInstanceOf(NotAuthorizedError);
    await first.harness.store.put('teachers', { id: 't9', name: 'After', order: 9 });
    await flush();
    expect(seen.at(-1)?.map((teacher) => teacher.name)).toContain('After');
  });

  it('has a socket whose teacher session ran out closed, so the page reconnects as a visitor and its public reads work again', async () => {
    const teacherPage = await page({ admin: true, adminExpiresAt: 1_800_000_000_000 + 1000 });
    const seen: Teacher[][] = [];
    teacherPage.services.teachers.watchTeachers((teachers) => seen.push(teachers));
    await flush();
    teacherPage.harness.clock.now += 2000;
    await teacherPage.harness.store.put('teachers', { id: 't9', name: 'During', order: 9 });
    await flush();
    expect(teacherPage.connection.isUp()).toBe(false);
    await teacherPage.clock.fire();
    expect(teacherPage.connection.isUp()).toBe(true);
    expect(teacherPage.session.isAdmin()).toBe(false);
    expect(seen.at(-1)?.map((teacher) => teacher.name)).toContain('During');
    await expect(teacherPage.services.teachers.add('x')).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});

describe('a live read the hub refuses', () => {
  it('tells whoever subscribed, with the same error class, and is not opened again after a reconnect', async () => {
    const { services, wire, clock } = await page();
    const refusals: unknown[] = [];
    const listener: RefusableListener<unknown> = Object.assign(() => undefined, { onRefused: (error: Error) => refusals.push(error) });
    services.lessons.watchLesson('x'.repeat(7000), listener);
    await flush();
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toBeInstanceOf(SurfaceError);
    wire.dropLatest();
    await clock.fire();
    await flush();
    expect(refusals).toHaveLength(1);
  });
});
