import { expect } from 'vitest';
import type { Participant, Session } from '../domain/models';
import { connect, createHarness, type Client, type Harness } from './hubHarness';

export const FAR = 9_000_000_000_000;

/** A hub with a class running: the harness, the teacher's page that started it, the class and its students. */
export async function classroom() {
  const harness = createHarness();
  await harness.core.seed(true);
  const admin = connect(harness, 'laptop', FAR);
  const classId = (await harness.store.list('classes'))[0].id;
  const lessonId = (await harness.store.list('lessons'))[0].id;
  const teacherId = (await harness.store.list('teachers'))[0].id;
  await admin.call(1, 'sessions', 'start', lessonId, classId, teacherId);
  const session = (await harness.store.list('sessions'))[0] as Session;
  const students = await harness.store.list('students');
  return { harness, admin, session, students, lessonId };
}

/** A device that asked for a seat in the class and was let in by the teacher. */
export async function seatFor(harness: Harness, admin: Client, code: string, device: string, studentId: string, groupId: string, address = 'local'): Promise<{ phone: Client; seat: Participant }> {
  const phone = connect(harness, device, null, address);
  expect(await phone.call(1, 'participants', 'join', code, groupId, studentId)).toMatchObject({ ok: true });
  const seat = (await harness.store.list('participants')).find((candidate) => candidate.id.endsWith(`:${device}`)) as Participant;
  await admin.call(2000 + Math.floor(Math.random() * 100000), 'admission', 'admit', seat.id, studentId);
  return { phone, seat };
}
