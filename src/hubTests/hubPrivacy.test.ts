import { describe, expect, it } from 'vitest';
import type { Lesson, Participant, Session, Student } from '../domain/models';
import { connect, createHarness, type Client, type Harness } from './hubHarness';

const FAR = 9_000_000_000_000;
const DEVICE_A = 'device-aaaaaaaaaaaaaaaaaaaaaaaa';
const DEVICE_B = 'device-bbbbbbbbbbbbbbbbbbbbbbbb';

interface TwoStudents {
  harness: Harness;
  admin: Client;
  lesson: Lesson;
  session: Session;
  slides: { first: string; second: string };
  a: { phone: Client; student: Student; seat: Participant };
  b: { phone: Client; student: Student; seat: Participant };
}

/** A class with two students from different groups in it, each on a phone of her own, both answered and given a heart. */
async function twoStudents(): Promise<TwoStudents> {
  const harness = createHarness();
  await harness.core.seed(true);
  const admin = connect(harness, 'laptop', FAR);
  const lesson = (await harness.store.list('lessons'))[0];
  const classId = (await harness.store.list('classes'))[0].id;
  const teacherId = (await harness.store.list('teachers'))[0].id;
  const session = ((await admin.call(1, 'sessions', 'start', lesson.id, classId, teacherId)) as unknown as { value: Session }).value;
  const students = await harness.store.list('students');
  const choices = lesson.slides.filter((slide) => slide.kind === 'choice' && slide.scope === 'individual');
  const seat = async (phone: Client, student: Student): Promise<Participant> => {
    await phone.call(1, 'participants', 'join', session.code, student.groupId, student.id);
    const mine = (await harness.store.list('participants', { sessionId: session.id })).find((candidate) => candidate.studentId === student.id) as Participant;
    await admin.call(Math.floor(Math.random() * 1e6) + 10, 'admission', 'admit', mine.id, student.id);
    return mine;
  };
  const [studentA, studentB] = [students[0], students[1]];
  const [phoneA, phoneB] = [connect(harness, DEVICE_A), connect(harness, DEVICE_B)];
  const seatA = await seat(phoneA, studentA);
  const seatB = await seat(phoneB, studentB);
  await admin.call(2, 'sessions', 'goTo', session.id, lesson.slides.indexOf(choices[0]));
  await phoneA.call(2, 'answers', 'submitFromDevice', session.id, choices[0].id, 0);
  await phoneB.call(2, 'answers', 'submitFromDevice', session.id, choices[0].id, 1);
  await admin.call(3, 'rewards', 'giveAsTeacher', session.id, { kind: 'student', id: studentB.id });
  return { harness, admin, lesson, session, slides: { first: choices[0].id, second: choices[1]?.id ?? choices[0].id }, a: { phone: phoneA, student: studentA, seat: seatA }, b: { phone: phoneB, student: studentB, seat: seatB } };
}

const WATCHES = (t: TwoStudents): [string, string, unknown[]][] => [
  ['lessons', 'watchLessons', []], ['lessons', 'watchLesson', [t.lesson.id]], ['classLookup', 'watchByCode', [t.session.code]], ['classLookup', 'watchAnyLive', []],
  ['sessionRoster', 'watchSeen', [t.session.code]], ['participants', 'watchMine', [t.session.id]], ['participants', 'watchNameClaims', [t.session.code]],
  ['seatView', 'watchMine', [t.session.id]], ['seatView', 'watchLesson', [t.session.id]], ['board', 'watchTotals', [t.session.code]], ['board', 'watchCardResults', [t.session.code, 1]],
  ['rewards', 'watchHeartCount', [t.session.code]], ['sessions', 'watchLive', []], ['sessions', 'watchAll', []], ['teachers', 'watchTeachers', []], ['content', 'watchSite', []],
  ['answers', 'watchAnswers', [t.session.id]], ['rewards', 'watchRewards', [t.session.id]], ['participants', 'watchParticipants', [t.session.id]],
  ['sessionRoster', 'watchRoster', [t.session.id]], ['roster', 'watchClasses', []], ['roster', 'watchRoster', [t.session.id]],
];

/** Everything a phone is sent after it asks for every live read there is. */
async function received(t: TwoStudents, phone: Client): Promise<string> {
  let id = 100;
  for (const [service, method, args] of WATCHES(t)) await phone.watch(id++, service, method, ...args);
  return phone.socket.sent.join('\n');
}

describe('what one student’s phone is sent', () => {
  it('holds nothing of the classmate beside her: not her seat, her device, her answer, the roll or any card number', async () => {
    const t = await twoStudents();
    for (const [mine, other, device] of [[t.a, t.b, DEVICE_B], [t.b, t.a, DEVICE_A]] as const) {
      const raw = await received(t, mine.phone);
      expect(raw, 'her own seat is there, so the scan can see one').toContain(mine.seat.id);
      expect(raw).not.toContain(other.seat.id);
      expect(raw).not.toContain(device);
      expect(raw).not.toContain(`:student:${other.student.id}"`);
      expect(raw).not.toMatch(/"present"/);
      expect(raw).not.toMatch(/cardNumber/);
      expect(raw).not.toMatch(/"admitted"\s*:\s*(true|false),"studentId":"/);
    }
  });

  it('holds neither the roll nor any card number for a visitor, and holds them for the teacher', async () => {
    const t = await twoStudents();
    const visitor = connect(t.harness, 'nobody');
    const raw = await received(t, visitor);
    expect(raw).not.toMatch(/"present"|cardNumber/);
    const teacherRaw = await received(t, t.admin);
    expect(teacherRaw).toMatch(/"present"/);
    expect(teacherRaw).toMatch(/cardNumber/);
  });

  it('holds the key and the explanation of the questions the teacher revealed, and of no other', async () => {
    const t = await twoStudents();
    const stored = (await t.harness.store.list('lessons'))[0];
    const keyed = stored.slides.filter((slide) => slide.kind === 'choice' && typeof slide.correctIndex === 'number' && slide.explanation !== '');
    expect(keyed.length).toBeGreaterThan(2);
    const [shown, ...hidden] = keyed;
    const explanationOf = (slide: unknown) => (slide as { explanation: string }).explanation;
    const before = await received(t, connect(t.harness, DEVICE_A));
    for (const slide of keyed) expect(before.includes(explanationOf(slide))).toBe(false);
    expect(before).not.toMatch(/"correctIndex":\s*\d/);
    await t.admin.call(50, 'sessions', 'reveal', t.session.id, shown.id);
    const after = await received(t, connect(t.harness, DEVICE_A));
    expect(after.includes(explanationOf(shown))).toBe(true);
    expect(after).toMatch(/"correctIndex":\s*\d/);
    for (const slide of hidden) expect(after.includes(explanationOf(slide))).toBe(false);
    const keysSeen = new Set((after.match(/"correctIndex":\s*\d/g) ?? []).map((key) => key.replace(/\s/g, '')));
    expect(keysSeen.size).toBeLessThanOrEqual(new Set([`"correctIndex":${(shown as { correctIndex: number }).correctIndex}`]).size);
  });
});
