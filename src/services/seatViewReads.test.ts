import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seatView, type SeatView } from '../domain/visibility';
import { answers, classData, ended, heart, hearts, lesson, live, reveal1, roster, seatOf, students } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { ParticipantService } from './ParticipantService';
import { SeatViewService } from './SeatViewService';
import { SessionRosterService } from './SessionRosterService';

let store: LocalDocumentStore;
const seatId = 'x:d1';

beforeEach(async () => {
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', live);
  await store.put('lessons', lesson);
  await store.put('rosters', roster);
  await Promise.all(answers.map((a) => store.put('answers', a)));
  await Promise.all(hearts.map((h) => store.put('rewards', h)));
});

function watched<T>(start: (listener: (value: T) => void) => () => void) {
  const seen: T[] = [];
  const stop = start((value) => seen.push(value));
  return { seen, stop, last: () => seen.at(-1) };
}

const caller: Caller = { isAdmin: () => false, deviceId: () => 'd1' };
const viewOfDevice = () => {
  const rosters = new SessionRosterService(store, caller);
  return new SeatViewService(store, new ParticipantService(store, caller, rosters));
};

describe('the view of a seat', () => {
  it('is null for a device that has no seat, a waiting one and a removed one', async () => {
    const view = watched<SeatView | null>((l) => viewOfDevice().watchMine('x', l));
    await vi.waitFor(() => expect(view.last()).toBeNull());
    await store.put('participants', seatOf(seatId, 'g1', 's1', false));
    await vi.waitFor(() => expect(view.seen.length).toBeGreaterThan(1));
    expect(view.last()).toBeNull();
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    await vi.waitFor(() => expect(view.last()).not.toBeNull());
    await store.remove('participants', seatId);
    await vi.waitFor(() => expect(view.last()).toBeNull());
    view.stop();
  });

  it('equals the domain view once let in, and follows a move, the roll, a reveal, a classmate heart and the end', async () => {
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    const view = watched<SeatView | null>((l) => viewOfDevice().watchMine('x', l));
    const seat = seatOf(seatId, 'g1', 's1');
    await vi.waitFor(() => expect(view.last()).toEqual(seatView(seat, classData())));
    expect(view.last()?.classmates.length).toBeGreaterThan(0);

    const moved = { ...roster, students: students.map((s) => (s.id === 's1' ? { ...s, groupId: 'g2' } : s)) };
    await store.put('rosters', moved);
    await vi.waitFor(() => expect(view.last()).toEqual(seatView(seat, classData({ roster: moved }))));
    expect(view.last()?.seat.groupId).toBe('g2');
    const before = seatView(seat, classData());
    const after = seatView(seat, classData({ roster: moved }));
    for (const frame of view.seen) expect([before, after]).toContainEqual(frame);

    await store.put('rosters', roster);
    const covered = { ...roster, present: ['s2'] };
    await store.put('rosters', covered);
    await vi.waitFor(() => expect(view.last()).toEqual(seatView(seat, classData({ roster: covered }))));

    const revealed = { ...live, reveals: reveal1 };
    await store.put('sessions', revealed);
    await vi.waitFor(() => expect(view.last()).toEqual(seatView(seat, classData({ roster: covered, session: revealed }))));

    const given = heart('student', 's3', 'teacher');
    await store.put('rewards', given);
    await vi.waitFor(() => expect(view.last()).toEqual(seatView(seat, classData({ roster: covered, session: revealed, rewards: [...hearts, given] }))));

    const over = { ...ended, reveals: reveal1 };
    await store.put('sessions', over);
    await vi.waitFor(() => expect(view.last()?.classmates).toEqual([]));
    expect(view.last()).toEqual(seatView(seat, classData({ roster: covered, session: over, rewards: [...hearts, given] })));
    view.stop();
  });
});

describe('the lesson of a class', () => {
  it('is the lesson the session names, and follows a change of it', async () => {
    const teacher: Caller = { isAdmin: () => true, deviceId: () => 'd1' };
    const seats = new SeatViewService(store, new ParticipantService(store, teacher, new SessionRosterService(store, teacher)));
    const seen = watched<unknown>((l) => seats.watchLesson('x', l));
    await vi.waitFor(() => expect(seen.last()).toEqual(lesson));
    const edited = { ...lesson, title: 'edited' };
    await store.put('lessons', edited);
    await vi.waitFor(() => expect(seen.last()).toEqual(edited));
    seen.stop();
  });
});
