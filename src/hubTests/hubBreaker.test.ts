import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DayLevel } from '../domain/abuse';
import { utcDayOf } from '../domain/abuse';
import { DAY_ROWS_ANSWERS_ONLY, DAY_ROWS_CLOSED, DAY_ROWS_FLUSH_MS } from '../ports/limits';
import { classroom } from './classKit';
import { connect, createHarness, type Harness } from './hubHarness';

const FAR = 9_000_000_000_000;
const DAY_LIMIT_ERROR = { name: 'LimitError', code: 'day-used' };

/** A hub with a scratch table to write rows into, so that the day's count can be pushed up without the count itself seeing the table made. */
function withScratch(location?: string): Harness {
  const harness = createHarness(location);
  harness.sql.run('CREATE TABLE IF NOT EXISTS scratch (n INTEGER)');
  return harness;
}

/** Writes rows to the scratch table until the day's count stands at `target`, as if that many rows had been saved. */
function burnTo(harness: Harness, target: number): void {
  const missing = target - harness.meter.rowsToday();
  if (missing > 0) harness.meter.run('INSERT INTO scratch (n) WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c WHERE n < ?) SELECT n FROM c', missing);
  expect(harness.meter.rowsToday()).toBe(target);
}

async function seeded(location?: string): Promise<Harness> {
  const harness = withScratch(location);
  await harness.core.seed(true);
  return harness;
}

describe('the day’s allowance of writes', () => {
  it('is open at 80,000 rows: everyone’s commands run as they always did', async () => {
    const harness = await seeded();
    burnTo(harness, DAY_ROWS_ANSWERS_ONLY);
    expect(harness.breaker.level()).toBe('open');
    const visitor = connect(harness, 'phone');
    expect(await visitor.call(1, 'teachers', 'add', 'x')).toMatchObject({ ok: false, error: { name: 'NotAuthorizedError' } });
  });

  it('is answers-only above 80,000: a visitor’s ordinary write is refused with the day-used limit, the essential ones (joining, answering) and every read still run, and the teacher’s runs', async () => {
    const harness = await seeded();
    burnTo(harness, DAY_ROWS_ANSWERS_ONLY + 1);
    expect(harness.breaker.level()).toBe('answers-only');
    const visitor = connect(harness, 'phone');
    expect(await visitor.call(1, 'teachers', 'add', 'x')).toMatchObject({ ok: false, error: DAY_LIMIT_ERROR });
    expect(await visitor.call(2, 'participants', 'join', 's', 'g', 'st')).toMatchObject({ ok: true, value: null });
    expect(await visitor.call(4, 'participants', 'leave', 'no-such-session')).toMatchObject({ ok: true });
    const answer = await visitor.call(3, 'answers', 'submitFromDevice', 'no-such-session', 'no-such-slide', 0);
    expect(answer.ok === false && answer.error).not.toMatchObject(DAY_LIMIT_ERROR);
    expect(await visitor.call(5, 'records', 'groupStandingsOf', 'ABC234', 'week')).toMatchObject({ ok: true, value: [] });
    const admin = connect(harness, 'laptop', FAR);
    expect(await admin.call(1, 'teachers', 'add', 'Huda')).toMatchObject({ ok: true });
  });

  it('lets a student still join, be let in, answer and read her own standings above 80,000', async () => {
    const { harness, admin, session, students, lessonId } = await classroom();
    harness.sql.run('CREATE TABLE IF NOT EXISTS scratch (n INTEGER)');
    burnTo(harness, DAY_ROWS_ANSWERS_ONLY + 1);
    const student = students[0];
    const lesson = (await harness.store.get('lessons', lessonId))!;
    const slide = lesson.slides.find((candidate) => candidate.kind === 'choice' && candidate.scope === 'individual')!;
    const phone = connect(harness, 'phone', null, '10.3.0.1');
    expect(await phone.call(1, 'participants', 'join', session.code, student.groupId, student.id)).toMatchObject({ ok: true });
    expect((await harness.store.list('participants')).length).toBe(1);
    const seat = (await harness.store.list('participants'))[0];
    expect(await admin.call(2, 'admission', 'admit', seat.id, student.id)).toMatchObject({ ok: true });
    expect(await admin.call(3, 'sessions', 'goTo', session.id, lesson.slides.indexOf(slide))).toMatchObject({ ok: true });
    expect(await phone.call(4, 'answers', 'submitFromDevice', session.id, slide.id, 0)).toMatchObject({ ok: true, value: true });
    expect(await phone.call(5, 'records', 'ownStandingIn', session.id, 'week')).toMatchObject({ ok: true });
    expect(await phone.call(6, 'records', 'groupStandingsOf', session.code, 'week')).toMatchObject({ ok: true });
    expect(await phone.call(7, 'rewards', 'giveAsPeer', session.id, students[1].id)).toMatchObject({ ok: false, error: DAY_LIMIT_ERROR });
    expect(await phone.call(8, 'participants', 'leave', session.id)).toMatchObject({ ok: true });
  });

  it('is closed above 95,000: even an answer is refused, and the teacher is never refused', async () => {
    const harness = await seeded();
    burnTo(harness, DAY_ROWS_CLOSED);
    expect(harness.breaker.level()).toBe('answers-only');
    burnTo(harness, DAY_ROWS_CLOSED + 1);
    expect(harness.breaker.level()).toBe('closed');
    const visitor = connect(harness, 'phone');
    expect(await visitor.call(1, 'answers', 'submitFromDevice', 's', 'q', 0)).toMatchObject({ ok: false, error: DAY_LIMIT_ERROR });
    expect(await visitor.call(3, 'participants', 'join', 's', 'g', 'st')).toMatchObject({ ok: false, error: DAY_LIMIT_ERROR });
    expect(await visitor.call(4, 'participants', 'leave', 's')).toMatchObject({ ok: false, error: DAY_LIMIT_ERROR });
    expect(await visitor.call(5, 'records', 'groupStandingsOf', 'ABC234', 'week')).toMatchObject({ ok: true, value: [] });
    await visitor.watch(6, 'teachers', 'watchTeachers');
    expect(visitor.socket.refusal(6)).toBeUndefined();
    const admin = connect(harness, 'laptop', FAR);
    expect(await admin.call(1, 'teachers', 'add', 'Huda')).toMatchObject({ ok: true });
    expect(await admin.call(2, 'sessions', 'end', 'nothing')).not.toMatchObject({ error: DAY_LIMIT_ERROR });
  });

  it('never refuses a live read, at any level', async () => {
    const harness = await seeded();
    burnTo(harness, DAY_ROWS_CLOSED + 1);
    const visitor = connect(harness, 'phone');
    await visitor.watch(1, 'teachers', 'watchTeachers');
    expect(visitor.socket.refusal(1)).toBeUndefined();
    expect(visitor.socket.values(1)).toHaveLength(1);
  });

  it('tells the teacher, on her live read, the level now and again when it changes after a command that wrote', async () => {
    const harness = await seeded();
    const admin = connect(harness, 'laptop', FAR);
    await admin.watch(1, 'allowance', 'watchLevel');
    expect(admin.socket.values(1)).toEqual(['open']);
    burnTo(harness, DAY_ROWS_ANSWERS_ONLY + 1);
    await admin.call(1, 'teachers', 'add', 'Huda');
    burnTo(harness, DAY_ROWS_CLOSED + 1);
    await admin.call(2, 'teachers', 'add', 'Amal');
    expect(admin.socket.values(1)).toEqual(['open', 'answers-only', 'closed']);
  });

  it('is not told to a visitor', async () => {
    const harness = await seeded();
    const visitor = connect(harness, 'phone');
    await visitor.watch(1, 'allowance', 'watchLevel');
    expect(visitor.socket.refusal(1)?.error).toMatchObject({ name: 'NotAuthorizedError' });
  });

  it('lets a watcher of the level hear each change once, and none after it stops', () => {
    const harness = withScratch();
    const heard: DayLevel[] = [];
    const stop = harness.breaker.watch((level) => heard.push(level));
    burnTo(harness, DAY_ROWS_ANSWERS_ONLY + 1);
    harness.breaker.refresh();
    harness.breaker.refresh();
    stop();
    burnTo(harness, DAY_ROWS_CLOSED + 1);
    harness.breaker.refresh();
    expect(heard).toEqual(['open', 'answers-only']);
  });
});

describe('the count of rows written', () => {
  const stored = (harness: Harness) => harness.sql.all<{ day: number; rows: number }>('SELECT day, rows FROM daily_writes');

  it('is saved at most once a minute, from the count in memory', async () => {
    const harness = await seeded();
    const day = utcDayOf(harness.clock.now);
    burnTo(harness, 1000);
    expect(stored(harness)).toEqual([]);
    harness.clock.now += DAY_ROWS_FLUSH_MS - 1;
    burnTo(harness, 2000);
    expect(stored(harness)).toEqual([]);
    harness.clock.now += 1;
    harness.meter.run('INSERT INTO scratch (n) VALUES (1)');
    const saved = stored(harness);
    expect(saved).toHaveLength(1);
    expect(saved[0].day).toBe(day);
    expect(saved[0].rows).toBeGreaterThanOrEqual(2001);
    const first = saved[0].rows;
    harness.clock.now += DAY_ROWS_FLUSH_MS - 1;
    burnTo(harness, first + 5000);
    expect(stored(harness)[0].rows).toBe(first);
    harness.clock.now += 1;
    harness.meter.run('INSERT INTO scratch (n) VALUES (1)');
    expect(stored(harness)[0].rows).toBe(harness.meter.rowsToday());
  });

  it('is saved by the hub’s alarm too, so a quiet hub loses nothing', async () => {
    const harness = await seeded();
    burnTo(harness, 4321);
    await harness.core.runAlarm();
    expect(stored(harness)[0].rows).toBe(harness.meter.rowsToday());
  });

  it('is read back when the hub starts again the same day, and the level follows', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'noha-pearls-day-'));
    try {
      const file = join(folder, 'hub.sqlite');
      const before = await seeded(file);
      burnTo(before, DAY_ROWS_ANSWERS_ONLY + 10);
      await before.core.runAlarm();
      const after = createHarness(file);
      expect(after.meter.rowsToday()).toBe(before.meter.rowsToday());
      expect(after.breaker.level()).toBe('answers-only');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('starts again from nothing at midnight UTC, opening everything, and the old day’s row is forgotten', async () => {
    const harness = await seeded();
    burnTo(harness, DAY_ROWS_CLOSED + 1);
    await harness.core.runAlarm();
    const visitor = connect(harness, 'phone');
    expect(await visitor.call(1, 'teachers', 'add', 'x')).toMatchObject({ error: DAY_LIMIT_ERROR });
    const midnight = (utcDayOf(harness.clock.now) + 1) * 86_400_000;
    harness.clock.now = midnight - 1;
    expect(harness.breaker.level()).toBe('closed');
    harness.clock.now = midnight;
    expect(harness.meter.rowsToday()).toBe(0);
    expect(harness.breaker.level()).toBe('open');
    expect(await visitor.call(2, 'teachers', 'add', 'x')).toMatchObject({ error: { name: 'NotAuthorizedError' } });
    await harness.core.runAlarm();
    expect(harness.sql.all<{ day: number }>('SELECT day FROM daily_writes').map((row) => row.day)).toEqual([utcDayOf(midnight)]);
  });
});
