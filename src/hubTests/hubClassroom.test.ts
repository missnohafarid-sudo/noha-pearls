import { describe, expect, it } from 'vitest';
import type { Participant, Session } from '../domain/models';
import { connect, createHarness, type Client } from './hubHarness';

const FAR = 9_000_000_000_000;
const SCHOOL_ADDRESS = '10.20.30.40';

async function classroom() {
  const harness = createHarness();
  await harness.core.seed(true);
  const admin = connect(harness, 'laptop', FAR, SCHOOL_ADDRESS);
  const [classId, lessonId, teacherId] = await Promise.all([harness.store.list('classes'), harness.store.list('lessons'), harness.store.list('teachers')]).then((lists) => lists.map((list) => list[0].id));
  await admin.call(1, 'sessions', 'start', lessonId, classId, teacherId);
  const session = (await harness.store.list('sessions'))[0] as Session;
  return { harness, admin, session, lesson: (await harness.store.list('lessons'))[0], students: await harness.store.list('students') };
}

describe('what a device without a seat may do with a class it knows the id of', () => {
  it('reads nothing and changes nothing through the calls that are about its own seat', async () => {
    const { harness, session, lesson } = await classroom();
    const outsider = connect(harness, 'outsider', null, '10.0.0.9');
    const slide = lesson.slides.find((candidate) => candidate.kind === 'choice')!;
    await outsider.watch(1, 'participants', 'watchMine', session.id);
    await outsider.watch(2, 'seatView', 'watchMine', session.id);
    await outsider.watch(3, 'seatView', 'watchLesson', session.id);
    expect([outsider.socket.values(1), outsider.socket.values(2), outsider.socket.values(3)]).toEqual([[null], [null], [null]]);
    const before = JSON.stringify(await harness.store.list('answers'));
    expect(await outsider.call(4, 'answers', 'submitFromDevice', session.id, slide.id, 0)).toMatchObject({ ok: true, value: false });
    expect(await outsider.call(5, 'rewards', 'giveAsPeer', session.id, 'someone')).toMatchObject({ ok: true, value: false });
    expect(await outsider.call(6, 'records', 'ownStandingIn', session.id, 'week')).toMatchObject({ ok: true, value: null });
    expect(await outsider.call(7, 'participants', 'leave', session.id)).toMatchObject({ ok: true });
    expect(JSON.stringify(await harness.store.list('answers'))).toBe(before);
    expect(await harness.store.list('rewards')).toEqual([]);
  });
});

describe('a classroom of 35 devices behind one school address', () => {
  it('joins, is let in, answers every question and gives hearts without any limit stopping a student, and the address is never locked', async () => {
    const { harness, admin, session, lesson, students } = await classroom();
    const devices: { phone: Client; student: (typeof students)[number] }[] = [];
    for (const [n, student] of students.slice(0, 35).entries()) {
      const phone = connect(harness, `phone-${n}`, null, SCHOOL_ADDRESS);
      await phone.watch(1, 'classLookup', 'watchByCode', session.code);
      expect(phone.socket.refusal(1)).toBeUndefined();
      expect(await phone.call(2, 'participants', 'join', session.code, student.groupId, student.id)).toMatchObject({ ok: true });
      devices.push({ phone, student });
    }
    harness.clock.now += 10_000;
    expect(await admin.call(3, 'admission', 'admitAll', session.id)).toMatchObject({ ok: true });
    const seats = (await harness.store.list('participants')) as Participant[];
    expect(seats.filter((seat) => seat.admitted).length).toBe(devices.length);
    let id = 10;
    for (const slide of lesson.slides) {
      harness.clock.now += 3000;
      await admin.call(id++, 'sessions', 'goTo', session.id, lesson.slides.indexOf(slide));
      if (slide.kind !== 'choice' && slide.kind !== 'text') continue;
      for (const { phone } of devices) {
        const result = await phone.call(id++, 'answers', 'submitFromDevice', session.id, slide.id, slide.kind === 'choice' ? 0 : 'جواب');
        expect(result.ok, JSON.stringify(result)).toBe(true);
      }
    }
    for (const { phone, student } of devices) {
      const mate = students.find((other) => other.groupId !== student.groupId);
      if (mate) expect(await phone.call(id++, 'rewards', 'giveAsPeer', session.id, mate.id)).toMatchObject({ ok: true });
    }
    expect(devices.every(({ phone }) => phone.socket.closedWith === null)).toBe(true);
    expect(harness.gate.turnsAway(SCHOOL_ADDRESS, null)).toBe(false);
  });
});

describe('the standings anyone may see', () => {
  it('are remembered between calls and forgotten when a record or a heart of the class list changes', async () => {
    const { harness, admin, session, students } = await classroom();
    await admin.call(2, 'sessions', 'end', session.id);
    const seat = connect(harness, 'holder');
    const standings = (client: Client, id: number) => client.call(id, 'records', 'groupStandingsOf', session.code, 'week');
    harness.sql.reset();
    const first = await standings(admin, 3);
    const readsFirst = harness.sql.rowsRead;
    harness.sql.reset();
    const again = await standings(admin, 4);
    expect(again.ok && again.value).toEqual(first.ok && first.value);
    const readsAgain = harness.sql.rowsRead;
    expect(readsAgain).toBeLessThan(readsFirst);
    await admin.call(5, 'rewards', 'giveAsTeacher', session.id, { kind: 'student', id: students[0].id });
    harness.sql.reset();
    await standings(admin, 6);
    expect(harness.sql.rowsRead).toBeGreaterThan(readsAgain);
    expect(seat.socket.closedWith).toBeNull();
  });
});
