import { describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_MS } from '../domain/adminAccess';
import type { Session, Teacher } from '../domain/models';
import { classroom } from './classKit';
import { clientOf, connect, createHarness, FakeSocket } from './hubHarness';
import { Connection } from '../server/Connection';
import { wake } from './requestsKit';
import { WATCHES_PER_DEVICE } from '../ports/limits';
import { CLOSE_SESSION_ENDED } from '../ports/wire';
import { UI_SURFACE } from '../services/Services';
import { isWireValue } from '../ports/wire';
import { SurfaceDispatcher } from '../services/surfaceDispatch';
import { createDataServices } from '../services/createDataServices';

const FAR = 9_000_000_000_000;

async function seeded() {
  const harness = createHarness();
  await harness.core.seed(true);
  return harness;
}

describe('the first start', () => {
  it('seeds an empty database once and leaves a seeded one alone', async () => {
    const { core, store } = await seeded();
    const before = JSON.stringify(await store.list('teachers'));
    expect((await store.list('lessons')).length).toBeGreaterThan(0);
    await store.put('teachers', { id: 'extra', name: 'x', order: 9 });
    await core.seed(true);
    expect(await store.list('teachers')).toHaveLength(2);
    expect(before).toContain('t1');
  });
});

describe('who may ask what', () => {
  it('tells a visitor she is not the admin, and refuses her every teacher command and teacher read', async () => {
    const harness = await seeded();
    const visitor = connect(harness, 'phone');
    expect(visitor.socket.messages()[0]).toMatchObject({ type: 'hello', admin: false });
    const refused = await visitor.call(1, 'teachers', 'add', 'Intruder');
    expect(refused).toMatchObject({ ok: false, error: { name: 'NotAuthorizedError' } });
    await visitor.watch(2, 'roster', 'watchClasses');
    expect(visitor.socket.refusal(2)?.error.name).toBe('NotAuthorizedError');
    expect(await harness.store.list('teachers')).toHaveLength(1);
  });

  it('refuses names that are not on the table, or are used the wrong way, or get the wrong number of arguments, without touching a service', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    const cases: [string, string, unknown[]][] = [
      ['teachers', 'deleteEverything', []],
      ['teachers', 'constructor', []],
      ['__proto__', 'add', ['x']],
      ['constructor', 'constructor', []],
      ['sessionRoster', 'rosterOf', ['x']],
      ['retention', 'clearIfDue', []],
      ['teachers', 'watchTeachers', []],
      ['teachers', 'add', []],
      ['teachers', 'add', ['a', 'b']],
    ];
    for (const [index, [service, method, args]] of cases.entries()) {
      const result = await admin.call(index + 1, service, method, ...args);
      expect(result.ok, `${service}.${method}`).toBe(false);
      expect(result).toMatchObject({ error: { name: 'SurfaceError' } });
    }
    await admin.watch(50, 'teachers', 'add', 'x');
    expect(admin.socket.refusal(50)?.error).toMatchObject({ name: 'SurfaceError', code: 'wrong-kind' });
    await admin.watch(51, 'teachers', 'watchNothing');
    expect(admin.socket.refusal(51)?.error).toMatchObject({ code: 'unknown-method' });
    await admin.watch(52, 'sessionRoster', 'watchRosterOf', 'x');
    expect(admin.socket.refusal(52)?.error).toMatchObject({ code: 'unknown-method' });
    expect(await harness.store.list('teachers')).toHaveLength(1);
    expect(harness.reported).toEqual([]);
  });

  it('ignores text that is not a message', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    await admin.connection.receive('not json');
    await admin.connection.receive('{"type":"call"}');
    expect(admin.socket.messages()).toHaveLength(1);
  });

  it('sends no internal message for a failure it does not know, and logs it here', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    harness.sql.reset();
    harness.sql.failOnStatement = 1;
    const result = await admin.call(1, 'teachers', 'add', 'Sara');
    expect(result).toMatchObject({ ok: false, error: { name: 'ServiceFailure' } });
    expect(JSON.stringify(result)).not.toContain('database');
    expect(harness.reported).toHaveLength(1);
  });
});

describe('commands and live reads', () => {
  it('lets the admin add a teacher and shows it to a watcher who did not ask again', async () => {
    const harness = await seeded();
    const watcher = connect(harness, 'phone');
    await watcher.watch(1, 'teachers', 'watchTeachers');
    expect((watcher.socket.values(1)[0] as Teacher[]).map((teacher) => teacher.name)).toEqual(['أ. المعلّمة']);
    const admin = connect(harness, 'laptop', FAR);
    expect(await admin.call(1, 'teachers', 'add', 'Huda')).toMatchObject({ ok: true });
    const latest = watcher.socket.values(1).at(-1) as Teacher[];
    expect(latest.map((teacher) => teacher.name)).toContain('Huda');
  });

  it('sends a value again only when it changed', async () => {
    const harness = await seeded();
    const watcher = connect(harness, 'phone');
    await watcher.watch(1, 'classLookup', 'watchAnyLive');
    const admin = connect(harness, 'laptop', FAR);
    await admin.call(1, 'teachers', 'add', 'Huda');
    expect(watcher.socket.values(1)).toEqual([false]);
  });

  it('stops sending after unwatch and after the connection closes', async () => {
    const harness = await seeded();
    const watcher = connect(harness, 'phone');
    const other = connect(harness, 'phone2');
    await watcher.watch(1, 'teachers', 'watchTeachers');
    await other.watch(1, 'teachers', 'watchTeachers');
    await watcher.send({ type: 'unwatch', id: 1 });
    other.connection.close();
    const admin = connect(harness, 'laptop', FAR);
    await admin.call(1, 'teachers', 'add', 'Huda');
    expect(watcher.socket.values(1)).toHaveLength(1);
    expect(other.socket.values(1)).toHaveLength(1);
  });

  it('applies a command whole or not at all', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    const text = ['1, Sara, Pearl', '2, Noor, Pearl', '3, Reem, Coral', '4, Huda, Coral'].join('\n');
    const classId = (await harness.store.list('classes'))[0].id;
    const snapshot = async () => JSON.stringify([await harness.store.list('groups'), await harness.store.list('students')]);
    const before = await snapshot();
    harness.sql.reset();
    expect(await admin.call(1, 'roster', 'importFromText', classId, text, 'replace')).toMatchObject({ ok: true });
    const statements = harness.sql.statements;
    expect(await snapshot()).not.toBe(before);

    const fresh = await seeded();
    const second = connect(fresh, 'laptop', FAR);
    const original = JSON.stringify([await fresh.store.list('groups'), await fresh.store.list('students')]);
    fresh.sql.reset();
    fresh.sql.failOnStatement = statements;
    const failed = await second.call(1, 'roster', 'importFromText', classId, text, 'replace');
    expect(failed.ok).toBe(false);
    fresh.sql.failOnStatement = 0;
    expect(JSON.stringify([await fresh.store.list('groups'), await fresh.store.list('students')])).toBe(original);
  });

  it('keeps the repairs a refused command had begun out of the store (a real service path that writes and then throws)', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    await harness.store.put('folders', { id: 'a', name: 'a', parentId: null, order: 1 });
    await harness.store.put('folders', { id: 'b', name: 'b', parentId: 'a', order: 1 });
    await harness.store.put('folders', { id: 'c', name: 'c', parentId: 'ghost', order: 2 });
    const before = JSON.stringify(await harness.store.list('folders'));
    const result = await admin.call(1, 'folders', 'move', 'a', 'b');
    expect(result).toMatchObject({ ok: false, error: { name: 'FolderError', code: 'folder-inside-itself' } });
    expect(JSON.stringify(await harness.store.list('folders'))).toBe(before);
    const repaired = await admin.call(2, 'folders', 'add', 'd', null);
    expect(repaired.ok).toBe(true);
    expect((await harness.store.get('folders', 'c'))?.parentId).toBeNull();
  });

  it('runs commands one at a time in the order they arrived', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    await Promise.all(['a', 'b', 'c', 'd'].map((name, index) => admin.send({ type: 'call', id: index + 1, service: 'teachers', method: 'add', args: [name] })));
    const names = (await harness.store.list('teachers')).sort((x, y) => x.order - y.order).map((teacher) => teacher.name);
    expect(names.slice(1)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refuses a duplicate live-read number and more live reads than one device may hold', async () => {
    const harness = await seeded();
    const watcher = connect(harness, 'phone');
    await watcher.watch(1, 'teachers', 'watchTeachers');
    await watcher.watch(1, 'teachers', 'watchTeachers');
    expect(watcher.socket.refusal(1)?.error.code).toBe('duplicate-watch');
    for (let id = 2; id <= WATCHES_PER_DEVICE + 1; id += 1) await watcher.watch(id, 'teachers', 'watchTeachers');
    expect(watcher.socket.refusal(WATCHES_PER_DEVICE + 1)?.error.code).toBe('too-many-watches');
    expect(JSON.stringify(watcher.socket.deserializeAttachment()).length).toBeLessThan(16_000);
  });

  it('survives a socket that can no longer be written to, without failing the command that woke it', async () => {
    const harness = await seeded();
    const watcher = connect(harness, 'phone');
    await watcher.watch(1, 'teachers', 'watchTeachers');
    watcher.socket.broken = true;
    const admin = connect(harness, 'laptop', FAR);
    expect(await admin.call(1, 'teachers', 'add', 'Huda')).toMatchObject({ ok: true });
  });
});

describe('the teacher stops being the admin', () => {
  it('has its socket closed, and nothing run for it, at its next message after her cookie runs out', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', harness.clock.now + ADMIN_SESSION_MS);
    await admin.watch(1, 'roster', 'watchClasses');
    expect(admin.socket.values(1)).toHaveLength(1);
    harness.clock.now += ADMIN_SESSION_MS + 1;
    await admin.send({ type: 'call', id: 1, service: 'teachers', method: 'add', args: ['x'] });
    expect(admin.socket.closedWith).toEqual({ code: CLOSE_SESSION_ENDED, reason: 'session ended' });
    expect(admin.socket.result(1)).toBeUndefined();
    expect(await harness.store.list('teachers')).toHaveLength(1);
    expect(admin.socket.messages().filter((message) => message.type === 'hello')).toEqual([{ type: 'hello', admin: true, now: expect.any(Number) }]);
  });

  it('has its socket closed, with its reads stopped, when a public read it holds next has something to say', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', harness.clock.now + 1000);
    await admin.watch(1, 'teachers', 'watchTeachers');
    harness.clock.now += 2000;
    await connect(harness, 'other', FAR).call(1, 'teachers', 'add', 'Huda');
    expect(admin.socket.closedWith).toMatchObject({ code: CLOSE_SESSION_ENDED });
    expect(admin.socket.values(1)).toHaveLength(1);
  });
});

describe('waking from hibernation', () => {
  it('opens a socket’s live reads again from its attachment, sends nothing yet, then sends changes', async () => {
    const harness = await seeded();
    const first = connect(harness, 'phone');
    await first.watch(7, 'teachers', 'watchTeachers');
    const admin = connect(harness, 'laptop', FAR);
    const socket = first.socket;
    const sentBefore = socket.sent.length;

    const woken = await wake(harness, socket);
    expect(woken).not.toBeNull();
    first.connection.close();
    expect(socket.sent.length).toBe(sentBefore);
    await admin.call(1, 'teachers', 'add', 'Huda');
    expect((socket.values(7).at(-1) as Teacher[]).map((teacher) => teacher.name)).toContain('Huda');
    expect(socket.sent.length).toBe(sentBefore + 1);
  });

  it('keeps the device and the admin expiry, and closes a socket whose teacher session ended while the hub slept', async () => {
    const harness = await seeded();
    const expiresAt = harness.clock.now + 1000;
    const admin = connect(harness, 'laptop', expiresAt);
    await admin.watch(1, 'roster', 'watchClasses');
    const socket = admin.socket;
    admin.connection.close();
    const awake = await wake(harness, socket) as Connection;
    expect(socket.closedWith).toBeNull();
    expect(awake.deviceId()).toBe('laptop');
    awake.close();
    harness.clock.now = expiresAt + 1;
    expect(await wake(harness, socket)).not.toBeNull();
    expect(socket.closedWith).toEqual({ code: CLOSE_SESSION_ENDED, reason: 'session ended' });
    expect(await wake(harness, new FakeSocket())).toBeNull();
  });

  it('closes a teacher’s socket whose session row went while the hub slept, so its next admin call is refused', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    expect((await admin.call(1, 'teachers', 'add', 'Huda')).ok).toBe(true);
    admin.connection.close();
    harness.sql.run('DELETE FROM admin_sessions');
    const awake = (await wake(harness, admin.socket)) as Connection;
    expect(admin.socket.closedWith).toEqual({ code: CLOSE_SESSION_ENDED, reason: 'session ended' });
    await clientOf(admin.socket, awake).send({ type: 'call', id: 2, service: 'teachers', method: 'add', args: ['Mona'] });
    expect(admin.socket.result(2)).toBeUndefined();
    expect((await harness.store.list('teachers')).map((teacher) => teacher.name)).not.toContain('Mona');
  });

  it('tells the page of a read it can no longer open, instead of dropping it silently', async () => {
    const harness = await seeded();
    const first = connect(harness, 'phone');
    await first.watch(7, 'teachers', 'watchTeachers');
    const socket = first.socket;
    const attached = socket.deserializeAttachment() as { watches: { service: string }[] };
    attached.watches[0].service = 'nothing';
    socket.serializeAttachment(attached);
    first.connection.close();
    await wake(harness, socket);
    expect(socket.refusal(7)?.error).toMatchObject({ name: 'SurfaceError', code: 'unknown-method' });
  });
});

describe('everything the surface returns survives JSON', () => {
  it('holds for every live read and the commands that return data, for the teacher, a let-in seat and a visitor', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    const classId = (await harness.store.list('classes'))[0].id;
    const lessonId = (await harness.store.list('lessons'))[0].id;
    const teacherId = (await harness.store.list('teachers'))[0].id;
    const session = ((await admin.call(1, 'sessions', 'start', lessonId, classId, teacherId)).ok && (await harness.store.list('sessions'))[0]) as Session;
    const sid = session.id;
    const student = (await harness.store.list('students'))[0];
    const phone = connect(harness, 'phone');
    await phone.call(1, 'participants', 'join', session.code, student.groupId, student.id);
    await admin.call(2, 'admission', 'admitAll', sid);
    const slide = (await harness.store.list('lessons'))[0].slides.find((candidate) => candidate.kind === 'choice');
    await phone.call(2, 'answers', 'submitFromDevice', sid, slide?.id, 0);
    await admin.call(3, 'rewards', 'giveAsTeacher', sid, { kind: 'student', id: student.id });
    await admin.call(4, 'sessions', 'end', sid);

    const period = { kind: 'week', start: 0, end: harness.clock.now + 1 };
    const watchArgs: Record<string, unknown[]> = {
      'roster.watchRoster': [classId], 'lessons.watchLesson': [lessonId], 'classLookup.watchByCode': [session.code],
      'sessionRoster.watchRoster': [sid], 'sessionRoster.watchSeen': [session.code], 'participants.watchParticipants': [sid], 'participants.watchMine': [sid],
      'participants.watchNameClaims': [session.code], 'answers.watchAnswers': [sid], 'rewards.watchRewards': [sid], 'rewards.watchHeartCount': [session.code],
      'records.watchKeptCount': [session.code], 'records.watchClassKeptCount': [classId], 'board.watchTotals': [session.code], 'board.watchCardResults': [session.code, student.cardNumber],
      'seatView.watchMine': [sid], 'seatView.watchLesson': [sid],
    };
    const callArgs: Record<string, unknown[]> = {
      'records.standingsOf': [classId, period], 'records.groupStandingsOf': [session.code, 'week'], 'records.ownStandingIn': [sid, period],
      'retention.rangeLimits': [], 'roster.exportToText': [classId, 'header'], 'retention.classesToRemove': [classId, { from: { year: 2020, month: 1, day: 1 }, to: { year: 2030, month: 1, day: 1 } }],
    };
    const seen: string[] = [];
    for (const [who, device, admin_] of [['admin', 'laptop', true], ['seat', 'phone', false], ['visitor', 'nobody', false]] as const) {
      const caller = { isAdmin: () => admin_, deviceId: () => device };
      const services = createDataServices(harness.store, caller);
      const dispatcher = new SurfaceDispatcher(services);
      for (const [service, methods] of Object.entries(UI_SURFACE)) {
        for (const method of methods as readonly string[]) {
          const key = `${service}.${method}`;
          if (method.startsWith('watch')) {
            let stop = () => undefined as void;
            try {
              stop = dispatcher.watch(service, method, watchArgs[key] ?? [], (value) => {
                expect(isWireValue(value), `${who} ${key}`).toBe(true);
                seen.push(`${who} ${key}`);
              });
            } catch (error) {
              expect((error as Error).name).toBe('NotAuthorizedError');
            }
            stop();
          } else if (key in callArgs) {
            const value = await dispatcher.call(service, method, callArgs[key]).catch((error: Error) => error);
            if (!(value instanceof Error)) expect(isWireValue(value), `${who} ${key}`).toBe(true);
          }
        }
      }
    }
    expect(seen.length).toBeGreaterThan(40);
    expect(harness.reported).toEqual([]);
  });
});

describe('a live read the store gives up on', () => {
  it('is told to the page, and every part of that read is closed, not only the one that failed', async () => {
    const { harness, session } = await classroom();
    const open = new Set<object>();
    const gaveUp: ((error: unknown) => void)[] = [];
    const watch = harness.store.watch.bind(harness.store);
    vi.spyOn(harness.store, 'watch').mockImplementation(((collection, where, listener, dropped) => {
      const handle = {};
      open.add(handle);
      if (dropped) gaveUp.push(dropped);
      const stop = watch(collection, where, listener, dropped);
      return () => {
        open.delete(handle);
        stop();
      };
    }) as typeof harness.store.watch);
    const page = connect(harness, 'phone', null, '10.9.0.1');
    await page.watch(1, 'classLookup', 'watchByCode', session.code);
    expect(open.size).toBeGreaterThan(1);
    gaveUp[0](new Error('the store dropped one read'));
    expect(page.socket.refusal(1)).toBeDefined();
    expect(open.size).toBe(0);
  });
});

describe('what is computed once for everyone', () => {
  it('is forgotten before a command’s writes reach the live reads, so a visitor never keeps a catalogue from before the change', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    const visitor = connect(harness, 'phone');
    await visitor.watch(1, 'lessons', 'watchLessons');
    const lesson = (await harness.store.list('lessons'))[0];
    await admin.call(2, 'lessons', 'save', { ...lesson, title: 'عنوان جديد' });
    const latest = visitor.socket.values(1).at(-1) as { title: string }[];
    expect(latest.map((shown) => shown.title)).toContain('عنوان جديد');
  });
});
