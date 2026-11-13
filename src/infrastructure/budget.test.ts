import { describe, expect, it } from 'vitest';
import sampleLesson from '../i18n/sampleLesson.json';
import { importLesson } from '../domain/lessonFormat';
import type { Group, Lesson, Session, Student } from '../domain/models';
import type { Caller } from '../ports/caller';
import { createDataServices } from '../services/createDataServices';
import type { DataServices } from '../services/Services';
import { SqlDocumentStore } from './SqlDocumentStore';
import { CountingSql } from './testKit/CountingSql';
import { NodeSqlDatabase } from './testKit/NodeSqlDatabase';
import { UnitOfWork } from './UnitOfWork';

/**
 * The free plan's daily limits (rows read, rows written, requests to the hub) against the worst day:
 * 16 classes of 35 students, 4 of them at once. The store must stay under a fifth of each limit.
 */
const DAILY_LIMITS = { rowsRead: 5_000_000, rowsWritten: 100_000, commands: 100_000 };
const CLASSES_PER_DAY = 16;
const STUDENTS = 35;
const GROUPS = 6;
const SAFETY_FACTOR = 5;
const HEARTS = 60;

const teacher: Caller = { isAdmin: () => true, deviceId: () => 'teacher-device' };
const deviceCaller = (deviceId: string): Caller => ({ isAdmin: () => false, deviceId: () => deviceId });

interface Measured {
  rowsRead: number;
  rowsWritten: number;
  commands: number;
}

/** A school with one class of 35 students in 6 groups and the sample lesson; `earlier` classes already ended. */
async function school(earlier: number) {
  const sql = new CountingSql(new NodeSqlDatabase());
  const base = new SqlDocumentStore(sql);
  const groups: Group[] = Array.from({ length: GROUPS }, (_, i) => ({ id: `g${i}`, classId: 'c1', name: `g${i}`, color: 'red', order: i }));
  const students: Student[] = Array.from({ length: STUDENTS }, (_, i) => ({ id: `s${i}`, name: `s${i}`, cardNumber: i + 1, groupId: `g${i % GROUPS}` }));
  const imported = importLesson(JSON.stringify(sampleLesson));
  if (!imported.ok) throw new Error('the sample lesson does not import');
  const lesson: Lesson = { ...imported.lesson, published: true };
  await base.put('classes', { id: 'c1', name: 'c', order: 1 });
  await base.put('teachers', { id: 't1', name: 't', order: 1 });
  await base.put('lessons', lesson);
  for (const group of groups) await base.put('groups', group);
  for (const student of students) await base.put('students', student);
  for (let n = 0; n < earlier; n += 1) {
    const session = { id: `old${n}`, code: `OLD${n}`, classId: 'c1', lessonId: lesson.id, status: 'ended' } as unknown as Session;
    await base.put('sessions', session);
  }
  return { sql, base, lesson, students };
}

/** One command, as the hub runs it: its writes kept together, applied once at the end, or not at all. */
async function runClass(earlier: number): Promise<Measured> {
  const { sql, base, lesson, students } = await school(earlier);
  sql.reset();
  let commands = 0;
  const command = async <T>(caller: Caller, work: (services: DataServices) => Promise<T>): Promise<T> => {
    commands += 1;
    const unit = new UnitOfWork(base);
    try {
      const result = await work(createDataServices(unit, caller));
      unit.commit();
      return result;
    } catch (error) {
      unit.rollback();
      throw error;
    }
  };

  const session = (await command(teacher, (s) => s.sessions.start(lesson.id, 'c1', 't1')))!;
  const sessionId = session.id;
  const deviceOf = (n: number) => deviceCaller(`device-${n}`);
  const stops = [
    base.watch('participants', { sessionId }, () => {}),
    base.watch('answers', { sessionId }, () => {}),
    base.watch('rewards', { sessionId }, () => {}),
    base.watch('sessions', {}, () => {}),
  ];
  students.forEach((_, n) => {
    stops.push(base.watch('sessions', { code: session.code }, () => {}));
    stops.push(base.watch('participants', { id: `${sessionId}:device-${n}` }, () => {}));
    stops.push(base.watch('answers', { sessionId }, () => {}));
  });

  for (const [n, student] of students.entries()) {
    const seat = await command(deviceOf(n), (s) => s.participants.join(sessionId, student.groupId, student.id));
    await command(teacher, (s) => s.admission.admit(seat!.id, student.id));
  }
  const groupDevices = Array.from({ length: GROUPS }, (_, g) => ({ n: STUDENTS + g, groupId: `g${g}` }));
  for (const { n, groupId } of groupDevices) {
    const seat = await command(deviceOf(n), (s) => s.participants.join(sessionId, groupId, null));
    await command(teacher, (s) => s.admission.admit(seat!.id, null));
  }

  for (const slide of lesson.slides) {
    const index = lesson.slides.indexOf(slide);
    await command(teacher, (s) => s.sessions.goTo(sessionId, index));
    if (slide.kind !== 'choice' && slide.kind !== 'text') continue;
    const value = slide.kind === 'choice' ? 0 : 'إجابة';
    if (slide.scope === 'individual') {
      for (const n of students.keys()) await command(deviceOf(n), (s) => s.answers.submitFromDevice(sessionId, slide.id, value));
    } else {
      for (const { n } of groupDevices) await command(deviceOf(n), (s) => s.answers.submitFromDevice(sessionId, slide.id, value));
    }
    await command(teacher, (s) => s.sessions.reveal(sessionId, slide.id));
  }

  for (let n = 0; n < HEARTS; n += 1) {
    expect(await command(teacher, (s) => s.rewards.giveAsTeacher(sessionId, { kind: 'student', id: students[n % STUDENTS].id }))).toBe(true);
  }
  await command(teacher, (s) => s.sessions.end(sessionId));
  stops.forEach((stop) => stop());

  expect(await base.list('answers', { sessionId })).toHaveLength(5 * STUDENTS + STUDENTS + 2 * GROUPS);
  expect(await base.list('rewards', { sessionId })).toHaveLength(HEARTS);
  return { rowsRead: sql.rowsRead, rowsWritten: sql.rowsWritten, commands };
}

function report(name: string, one: Measured): void {
  const day = (value: number) => value * CLASSES_PER_DAY;
  console.log(
    `${name}: one class read ${one.rowsRead} rows, wrote ${one.rowsWritten}, ran ${one.commands} commands; ` +
      `a worst day (${CLASSES_PER_DAY} classes) reads ${day(one.rowsRead)} (limit ${DAILY_LIMITS.rowsRead}), ` +
      `writes ${day(one.rowsWritten)} (limit ${DAILY_LIMITS.rowsWritten}), runs ${day(one.commands)} commands (limit ${DAILY_LIMITS.commands})`,
  );
  expect(day(one.rowsRead)).toBeLessThan(DAILY_LIMITS.rowsRead / SAFETY_FACTOR);
  expect(day(one.rowsWritten)).toBeLessThan(DAILY_LIMITS.rowsWritten / SAFETY_FACTOR);
  expect(day(one.commands)).toBeLessThan(DAILY_LIMITS.commands / SAFETY_FACTOR);
}

describe('the daily budget of the free plan', () => {
  it('holds for a worst day of whole classes on the sample lesson', async () => {
    report('fresh school', await runClass(0));
  });

  it('holds late in the school year, with 1000 earlier classes stored', async () => {
    report('school with 1000 earlier classes', await runClass(1000));
  });
});
