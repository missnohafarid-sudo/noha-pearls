import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answer, ended, heart, lesson, live, roster, seatOf, students } from '../domain/visibility.fixtures';
import type { ClassData, Reader } from '../domain/visibility';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { watchClassData } from './classData';
import { createDataServices } from './createDataServices';
import { ParticipantService } from './ParticipantService';
import { RosterService } from './RosterService';
import { SessionRosterService } from './SessionRosterService';
import { UI_SURFACE } from './Services';

const INTERNAL = {
  sessionRoster: ['rosterOf', 'watchRosterOf', 'joinRoll', 'addToRoll'],
  roster: ['rosterOfClass'],
  lessons: ['moveLessons'],
  participants: ['admittedSeat', 'watchReader'],
  records: ['keep'],
  retention: ['clearIfDue'],
};

let store: LocalDocumentStore;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
});

function watched<T>(start: (listener: (value: T) => void) => () => void) {
  const seen: T[] = [];
  const stop = start((value) => seen.push(value));
  return { seen, stop, last: () => seen.at(-1) };
}

describe('the reader of a caller', () => {
  const asDevice = (isAdmin = false): ParticipantService => {
    const caller: Caller = { isAdmin: () => isAdmin, deviceId: () => 'd1' };
    return new ParticipantService(store, caller, new SessionRosterService(store, caller));
  };
  const seatId = 'x:d1';

  beforeEach(async () => {
    await store.put('rosters', roster);
  });

  it('follows admission and removal of her seat', async () => {
    const reading = watched<Reader>((l) => asDevice().watchReader('x', l));
    await vi.waitFor(() => expect(reading.last()).toEqual({ isAdmin: false, seat: null }));
    await store.put('participants', seatOf(seatId, 'g1', 's1', false));
    await settle();
    expect(reading.last()?.seat).toBeNull();
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    await vi.waitFor(() => expect(reading.last()?.seat).toEqual(seatOf(seatId, 'g1', 's1')));
    await store.remove('participants', seatId);
    await vi.waitFor(() => expect(reading.last()?.seat).toBeNull());
    reading.stop();
  });

  it('carries the seat as stored, whatever the roster does: her group is read beside the class data', async () => {
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    const reading = watched<Reader>((l) => asDevice().watchReader('x', l));
    await vi.waitFor(() => expect(reading.last()?.seat).toEqual(seatOf(seatId, 'g1', 's1')));
    await store.put('rosters', { ...roster, present: ['s1'], students: students.map((s) => (s.id === 's1' ? { ...s, groupId: 'g2' } : s)) });
    await settle();
    expect(reading.last()).toEqual({ isAdmin: false, seat: seatOf(seatId, 'g1', 's1') });
    reading.stop();
  });

  it('reads the admin standing of the caller', async () => {
    const reading = watched<Reader>((l) => asDevice(true).watchReader('x', l));
    await vi.waitFor(() => expect(reading.last()).toEqual({ isAdmin: true, seat: null }));
    reading.stop();
  });
});

describe('the data of a class', () => {
  it('is null while the session is not stored', async () => {
    const data = watched<ClassData | null>((l) => watchClassData(store, 'x', l));
    await vi.waitFor(() => expect(data.last()).toBeNull());
    data.stop();
  });

  it('emits once everything is loaded, then on a change of each kind, and follows the lesson of the session', async () => {
    await store.put('sessions', live);
    await store.put('lessons', lesson);
    await store.put('rosters', roster);
    const data = watched<ClassData | null>((l) => watchClassData(store, 'x', l));
    await vi.waitFor(() => expect(data.last()).toMatchObject({ session: live, lesson, roster, answers: [], rewards: [] }));

    const next = async (change: () => Promise<unknown>, expected: Partial<ClassData>) => {
      await change();
      await vi.waitFor(() => expect(data.last()).toMatchObject(expected));
    };
    const a = answer('q1', 'student', 's1', 1);
    const h = heart('student', 's1', 'teacher');
    await next(() => store.put('answers', a), { answers: [a] });
    await next(() => store.put('rewards', h), { rewards: [h] });
    await next(() => store.put('rosters', { ...roster, present: ['s1'] }), { roster: { ...roster, present: ['s1'] } });
    await next(() => store.put('sessions', ended), { session: ended });
    const edited = { ...lesson, title: 'edited' };
    await next(() => store.put('lessons', edited), { lesson: edited });
    const other = { ...lesson, id: 'l2', title: 'other' };
    await store.put('lessons', other);
    await next(() => store.put('sessions', { ...ended, lessonId: 'l2' }), { lesson: other });
    data.stop();
  });
});

describe('the roster of a class list', () => {
  it('emits once both its lists are loaded, then on each change', async () => {
    const rosters = new RosterService(store, { isAdmin: () => true, deviceId: () => 'd1' });
    await store.put('groups', { id: 'g1', classId: 'c1', name: 'a', color: '#000', order: 1 });
    const watching = watched<unknown>((l) => rosters.watchRoster('c1', l));
    await vi.waitFor(() => expect(watching.seen.length).toBeGreaterThan(0));
    await store.put('students', { id: 's1', name: 'Sara', cardNumber: 1, groupId: 'g1' });
    await vi.waitFor(() => expect(JSON.stringify(watching.last())).toContain('Sara'));
    watching.stop();
  });
});

describe('what the interface may ask', () => {
  const built = () => createDataServices(store, { isAdmin: () => false, deviceId: () => 'd1' }) as unknown as Record<string, Record<string, unknown>>;

  it('names only methods the services have', () => {
    const services = built();
    for (const [service, names] of Object.entries(UI_SURFACE)) {
      for (const name of names) expect(typeof services[service][name], `${service}.${name}`).toBe('function');
    }
  });

  it('never names an internal method', () => {
    const listed = UI_SURFACE as Record<string, readonly string[]>;
    for (const [service, names] of Object.entries(INTERNAL)) {
      for (const name of names) expect(listed[service], `${service}.${name}`).not.toContain(name);
    }
  });
});
