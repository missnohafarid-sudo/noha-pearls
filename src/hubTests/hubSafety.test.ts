import { describe, expect, it } from 'vitest';
import { nextClearingAt } from '../domain/retention';
import { DAY_MS } from '../domain/periods';
import type { RetentionSettings, Session } from '../domain/models';
import { connect, createHarness, type Harness } from './hubHarness';
import { MAX_ADMIN_MESSAGE_LENGTH, MAX_MESSAGE_LENGTH } from '../ports/limits';
import { CLOSE_POLICY } from '../ports/wire';
import { deviceIdOf } from '../server/identity';

const FAR = 9_000_000_000_000;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function seeded() {
  const harness = createHarness();
  await harness.core.seed(true);
  return harness;
}

async function ids(harness: Harness) {
  return {
    lessonId: (await harness.store.list('lessons'))[0].id,
    classId: (await harness.store.list('classes'))[0].id,
    teacherId: (await harness.store.list('teachers'))[0].id,
  };
}

describe('one bad watcher among others', () => {
  it('does not stop the teacher starting a class, which succeeds exactly once, nor the other watchers hearing of it', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    const early = connect(harness, 'early');
    await early.watch(1, 'classLookup', 'watchAnyLive');
    const attacker = connect(harness, 'attacker');
    const depth = 20_000;
    await attacker.connection.receive(`{"type":"watch","id":1,"service":"classLookup","method":"watchByCode","args":[${'['.repeat(depth)}${']'.repeat(depth)}]}`);
    const late = connect(harness, 'late');
    await late.watch(1, 'classLookup', 'watchAnyLive');
    let failing = 0;
    harness.store.watch('sessions', {}, () => { failing += 1; if (failing > 1) throw new Error('a watcher that breaks'); });
    const { lessonId, classId, teacherId } = await ids(harness);
    const started = await admin.call(1, 'sessions', 'start', lessonId, classId, teacherId);
    expect(started.ok).toBe(true);
    expect(await harness.store.list('sessions')).toHaveLength(1);
    expect(early.socket.values(1).at(-1)).toBe(true);
    expect(late.socket.values(1).at(-1)).toBe(true);
    expect(harness.reported).toHaveLength(1);
  });

  it('is told to the page that opened it, when the store has to give up on it', async () => {
    const harness = await seeded();
    const phone = connect(harness, 'phone');
    harness.sql.reset();
    await harness.store.put('teachers', { id: 'probe', name: 'p', order: 8 });
    const statementsOfAWrite = harness.sql.statements;
    await phone.watch(5, 'teachers', 'watchTeachers');
    await phone.watch(6, 'teachers', 'watchTeachers');
    phone.socket.sent.length = 0;
    harness.sql.reset();
    harness.sql.failOnStatement = statementsOfAWrite + 1;
    await harness.store.put('teachers', { id: 'next', name: 'n', order: 9 });
    expect(phone.socket.refusal(5)?.error).toEqual({ name: 'ServiceFailure' });
    expect(phone.socket.refusal(6)).toBeUndefined();
    expect(harness.reported).toHaveLength(1);
    const attached = phone.socket.deserializeAttachment() as { watches: { id: number }[] };
    expect(attached.watches.map((watch) => watch.id)).toEqual([6]);
    phone.socket.sent.length = 0;
    await harness.store.put('teachers', { id: 'last', name: 'l', order: 10 });
    expect(phone.socket.values(5)).toEqual([]);
    expect(phone.socket.values(6)).toHaveLength(1);
  });
});

describe('what a socket may send', () => {
  it('closes at once on a message that is not text, or is longer than 64,000 characters for anyone but the teacher', async () => {
    const harness = await seeded();
    const visitor = connect(harness, 'phone');
    await visitor.sendRaw(new ArrayBuffer(8));
    expect(visitor.socket.closedWith).toMatchObject({ code: CLOSE_POLICY });
    const talker = connect(harness, 'phone2');
    const name = 'x'.repeat(MAX_MESSAGE_LENGTH);
    await talker.send({ type: 'call', id: 1, service: 'teachers', method: 'add', args: [name] });
    expect(talker.socket.closedWith).toMatchObject({ code: CLOSE_POLICY });
    expect(talker.socket.result(1)).toBeUndefined();
    const fine = connect(harness, 'phone3');
    await fine.send({ type: 'unwatch', id: 1 });
    expect(fine.socket.closedWith).toBeNull();
  });

  it('lets the teacher send a whole lesson, up to the larger limit', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    const text = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
    await admin.call(1, 'lessons', 'importFromText', text, null);
    expect(admin.socket.closedWith).toBeNull();
    await admin.send({ type: 'call', id: 2, service: 'teachers', method: 'add', args: ['y'.repeat(MAX_ADMIN_MESSAGE_LENGTH)] });
    expect(admin.socket.closedWith).toMatchObject({ code: CLOSE_POLICY });
    expect(admin.socket.result(2)).toBeUndefined();
  });

  it('refuses a live read whose arguments would not fit the socket’s attachment, before opening it, and leaves nothing registered', async () => {
    const harness = await seeded();
    const phone = connect(harness, 'phone');
    await phone.watch(1, 'lessons', 'watchLesson', 'x'.repeat(7000));
    expect(phone.socket.refusal(1)?.error).toMatchObject({ name: 'SurfaceError', code: 'bad-arguments' });
    expect((phone.socket.deserializeAttachment() as { watches: unknown[] }).watches).toEqual([]);
    harness.sql.reset();
    const before = phone.socket.sent.length;
    await harness.store.put('lessons', { ...(await harness.store.list('lessons'))[0], title: 'changed' });
    expect(phone.socket.sent.length).toBe(before);
    await phone.watch(2, 'teachers', 'watchTeachers');
    expect(phone.socket.values(2)).toHaveLength(1);
  });

  it('counts the read being added against the attachment limit, not only the ones already open', async () => {
    const harness = await seeded();
    const phone = connect(harness, 'phone');
    const padded = (id: number) => `AB${String(id).padStart(2, '0')}34`.padEnd(64, ' ');
    const outcomes: boolean[] = [];
    for (let id = 1; id <= 48; id += 1) {
      await phone.watch(id, 'classLookup', 'watchByCode', padded(id));
      outcomes.push(phone.socket.refusal(id) === undefined);
    }
    expect(outcomes.filter(Boolean).length).toBeGreaterThan(20);
    expect(outcomes.at(-1)).toBe(false);
    expect(JSON.stringify(phone.socket.deserializeAttachment()).length).toBeLessThan(6000);
  });
});

describe('the yearly clearing', () => {
  async function withYearEnd() {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    expect(await admin.call(1, 'retention', 'setYearEnd', { month: 6, day: 30 })).toMatchObject({ ok: true });
    const settings = (await harness.store.list('retention'))[0] as RetentionSettings;
    return { harness, due: nextClearingAt(settings) as number };
  }

  it('does nothing before it is due, and schedules the next check within a day', async () => {
    const { harness, due } = await withYearEnd();
    const students = (await harness.store.list('students')).length;
    harness.clock.now = due - 2 * DAY_MS;
    const next = await harness.core.runAlarm();
    expect((await harness.store.list('students')).length).toBe(students);
    expect(next).toBe(harness.clock.now + DAY_MS);
  });

  it('clears the students’ data once when due, schedules the next check, and does not clear again', async () => {
    const { harness, due } = await withYearEnd();
    expect((await harness.store.list('students')).length).toBeGreaterThan(0);
    harness.clock.now = due + 1;
    const next = await harness.core.runAlarm();
    expect(await harness.store.list('students')).toEqual([]);
    expect(await harness.store.list('classes')).toEqual([]);
    expect(next).toBe(harness.clock.now + DAY_MS);
    expect((await harness.store.list('teachers')).length).toBeGreaterThan(0);
    await harness.store.put('classes', { id: 'later', name: 'Later', order: 1 });
    await harness.core.runAlarm();
    expect(await harness.store.list('classes')).toHaveLength(1);
  });

  it('waits its turn behind a command that is running', async () => {
    const { harness, due } = await withYearEnd();
    harness.clock.now = due + 1;
    let release = () => undefined as void;
    void harness.core.exclusive(() => new Promise<void>((resolve) => { release = resolve; }));
    const alarm = harness.core.runAlarm();
    await flush();
    expect((await harness.store.list('students')).length).toBeGreaterThan(0);
    release();
    await alarm;
    expect(await harness.store.list('students')).toEqual([]);
  });

  it('cannot be asked for, or run as the system, by any message from anyone', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    for (const method of ['clearIfDue', 'nextCheckAt', 'clearingDueAt']) {
      expect(await admin.call(1, 'retention', method)).toMatchObject({ ok: false, error: { name: 'SurfaceError', code: 'unknown-method' } });
    }
    expect(await deviceIdOf('A'.repeat(43))).not.toBe('system');
    expect(await deviceIdOf('A'.repeat(43))).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('the names the page answers itself', () => {
  it('are refused when they come to the hub', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    expect(await admin.call(1, 'records', 'currentPeriod', 'week')).toMatchObject({ ok: false, error: { name: 'SurfaceError', code: 'unknown-method' } });
    expect(await admin.call(2, 'lessons', 'exportToText', {})).toMatchObject({ ok: false, error: { name: 'SurfaceError', code: 'unknown-method' } });
    const { lessonId, classId, teacherId } = await ids(harness);
    const session = (await admin.call(3, 'sessions', 'start', lessonId, classId, teacherId)) as { value: Session };
    expect(session.value.id).toBeTruthy();
  });
});
