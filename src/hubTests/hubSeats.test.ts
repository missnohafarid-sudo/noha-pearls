import { describe, expect, it } from 'vitest';
import { DEVICE_SEAT_CHANGES, WAITING_SEATS_PER_STUDENT } from '../ports/limits';
import { classroom, seatFor } from './classKit';
import { connect } from './hubHarness';

const LIMIT = (code: string) => ({ name: 'LimitError', code });

describe('asking for seats', () => {
  it('stops at two waiting devices for one name, and a device asking again keeps its one seat and adds no other', async () => {
    const { harness, session, students } = await classroom();
    const student = students[0];
    const join = (device: string) => connect(harness, device, null, '10.4.0.1').call(1, 'participants', 'join', session.code, student.groupId, student.id);
    for (let n = 0; n < WAITING_SEATS_PER_STUDENT; n += 1) expect(await join(`d${n}`)).toMatchObject({ ok: true });
    const third = await join('d9');
    expect(third).toMatchObject({ ok: false, error: LIMIT('seats-full') });
    expect(await join('d0')).toMatchObject({ ok: true });
    expect((await harness.store.list('participants')).length).toBe(2);
  });

  it('stops at ten waiting shared devices in a class', async () => {
    const { harness, session, students } = await classroom();
    const outcomes: boolean[] = [];
    for (let n = 0; n < 11; n += 1) outcomes.push((await connect(harness, `s${n}`, null, `10.5.0.${n}`).call(1, 'participants', 'join', session.code, students[0].groupId, null)).ok);
    expect(outcomes).toEqual([...Array(10).fill(true), false]);
  });

  it('writes one row for ten identical joins, and spends none of the device’s seat changes on the nine that changed nothing', async () => {
    const { harness, session, students } = await classroom();
    const phone = connect(harness, 'eager', null, '10.6.0.1');
    const results = [];
    for (let n = 0; n < 10; n += 1) results.push(await phone.call(n + 1, 'participants', 'join', session.code, students[0].groupId, students[0].id));
    expect(results.every((result) => result.ok)).toBe(true);
    expect((await harness.store.list('participants')).length).toBe(1);
    harness.sql.reset();
    await phone.call(50, 'participants', 'join', session.code, students[0].groupId, students[0].id);
    expect(harness.sql.rowsWritten).toBe(0);
    for (let n = 1; n < DEVICE_SEAT_CHANGES.max; n += 1) {
      const other = students[n % 2 === 0 ? 0 : 1];
      expect(await phone.call(100 + n, 'participants', 'join', session.code, other.groupId, other.id)).toMatchObject({ ok: true });
    }
  });

  it('allows six seat changes an hour to a device, joins and leaves that write, and refuses the seventh with the joins limit until the hour has passed', async () => {
    const { harness, session, students } = await classroom();
    const [first, second] = students;
    const phone = connect(harness, 'changer', null, '10.6.0.2');
    const change = (id: number, who: typeof first) => phone.call(id, 'participants', 'join', session.code, who.groupId, who.id);
    expect(await change(1, first)).toMatchObject({ ok: true });
    expect(await phone.call(2, 'participants', 'leave', session.id)).toMatchObject({ ok: true });
    expect(await change(3, second)).toMatchObject({ ok: true });
    expect(await change(4, first)).toMatchObject({ ok: true });
    expect(await phone.call(5, 'participants', 'leave', session.id)).toMatchObject({ ok: true });
    expect(await change(6, second)).toMatchObject({ ok: true });
    expect(await change(7, first)).toMatchObject({ ok: false, error: LIMIT('joins') });
    expect(await phone.call(8, 'participants', 'leave', session.id)).toMatchObject({ ok: false, error: LIMIT('joins') });
    expect(await connect(harness, 'another', null, '10.6.0.2').call(1, 'participants', 'join', session.code, first.groupId, first.id)).toMatchObject({ ok: true });
    harness.clock.now += DEVICE_SEAT_CHANGES.windowMs;
    expect(await change(9, first)).toMatchObject({ ok: true });
  });

  it('counts a device that asks again after the teacher removed it, and counts a leave that has no seat to give up as nothing', async () => {
    const { harness, admin, session, students } = await classroom();
    const { phone, seat } = await seatFor(harness, admin, session.code, 'persistent', students[0].id, students[0].groupId);
    const idle = connect(harness, 'idle', null, '10.6.0.3');
    for (let n = 0; n < 10; n += 1) expect(await idle.call(n + 1, 'participants', 'leave', session.id)).toMatchObject({ ok: true });
    expect(await idle.call(20, 'participants', 'join', session.code, students[1].groupId, students[1].id)).toMatchObject({ ok: true });
    for (let n = 0; n < DEVICE_SEAT_CHANGES.max - 1; n += 1) {
      await admin.call(100 + n, 'admission', 'remove', seat.id);
      expect(await phone.call(200 + n, 'participants', 'join', session.code, students[0].groupId, students[0].id)).toMatchObject({ ok: true });
    }
    await admin.call(300, 'admission', 'remove', seat.id);
    expect(await phone.call(301, 'participants', 'join', session.code, students[0].groupId, students[0].id)).toMatchObject({ ok: false, error: LIMIT('joins') });
  });
});

describe('asking whether a device is seated', () => {
  it('costs the rows of one question for a hundred, and follows a seat being given', async () => {
    const { harness, admin, session, students } = await classroom();
    await seatFor(harness, admin, session.code, 'other', students[1].id, students[1].groupId);
    harness.sql.reset();
    await harness.core.isSeated('first');
    const oneQuestion = harness.sql.rowsRead;
    expect(oneQuestion).toBeGreaterThan(0);
    harness.sql.reset();
    for (let ask = 0; ask < 100; ask += 1) expect(await harness.core.isSeated('phone')).toBe(false);
    expect(harness.sql.rowsRead).toBeLessThanOrEqual(oneQuestion);
    await seatFor(harness, admin, session.code, 'phone', students[0].id, students[0].groupId);
    expect(await harness.core.isSeated('phone')).toBe(true);
  });
});
