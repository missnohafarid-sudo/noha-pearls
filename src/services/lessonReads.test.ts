import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson, LessonFolder, LessonSummary } from '../domain/models';
import { lesson, live, roster, seatOf } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { createDataServices } from './createDataServices';

let store: LocalDocumentStore;
let admin = false;
const caller: Caller = { isAdmin: () => admin, deviceId: () => 'd1' };
const services = () => createDataServices(store, caller);
const seatId = 'x:d1';

const hidden: Lesson = { ...lesson, id: 'l2', folderId: 'f2', title: 'Hidden', published: false, updatedAt: 9 };
const shown: Lesson = { ...lesson, folderId: 'f1' };
const folders: LessonFolder[] = [
  { id: 'f1', name: 'Open folder', parentId: null, order: 1 },
  { id: 'f2', name: 'Secret folder', parentId: null, order: 2 },
];

beforeEach(async () => {
  admin = false;
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await Promise.all(folders.map((folder) => store.put('folders', folder)));
  await store.put('lessons', shown);
  await store.put('lessons', hidden);
  await store.put('sessions', { ...live, lessonId: 'l2' });
  await store.put('rosters', roster);
});

function watched<T>(start: (listener: (value: T) => void) => () => void) {
  const seen: T[] = [];
  const stop = start((value) => seen.push(value));
  return { seen, stop, last: () => seen.at(-1) };
}

/** No answer key anywhere in what was emitted: no correct index but null, no explanation text. */
function expectNoKey(emitted: unknown) {
  const text = JSON.stringify(emitted);
  expect(text).not.toContain('because');
  expect(text).not.toContain('since');
  expect(text).not.toMatch(/"correctIndex":\d/);
}

describe('the lessons a caller receives', () => {
  it('a signed-out caller gets published summaries only, with no slides and no key', async () => {
    const reading = watched<LessonSummary[]>((l) => services().lessons.watchLessons(l));
    await vi.waitFor(() => expect(reading.last()?.map((l) => l.id)).toEqual(['l1']));
    expect(reading.last()?.[0]).not.toHaveProperty('slides');
    expectNoKey(reading.seen);
    reading.stop();
  });

  it('the admin gets the summaries of every lesson, newest first', async () => {
    admin = true;
    const reading = watched<LessonSummary[]>((l) => services().lessons.watchLessons(l));
    await vi.waitFor(() => expect(reading.last()?.map((l) => l.id)).toEqual(['l2', 'l1']));
    reading.stop();
  });

  it('a published lesson reaches a signed-out caller without its key; an unpublished one is null', async () => {
    const open = watched<Lesson | null>((l) => services().lessons.watchLesson('l1', l));
    const closed = watched<Lesson | null>((l) => services().lessons.watchLesson('l2', l));
    await vi.waitFor(() => expect(open.last()?.slides).toHaveLength(4));
    await vi.waitFor(() => expect(closed.seen).toEqual([null]));
    expectNoKey(open.seen);
    open.stop();
    closed.stop();
  });

  it('a missing lesson is null', async () => {
    const reading = watched<Lesson | null>((l) => services().lessons.watchLesson('nobody', l));
    await vi.waitFor(() => expect(reading.seen).toEqual([null]));
    reading.stop();
  });

  it('the admin gets every lesson raw, the unpublished one too', async () => {
    admin = true;
    const open = watched<Lesson | null>((l) => services().lessons.watchLesson('l1', l));
    const closed = watched<Lesson | null>((l) => services().lessons.watchLesson('l2', l));
    await vi.waitFor(() => expect(open.last()).toEqual(shown));
    await vi.waitFor(() => expect(closed.last()).toEqual(hidden));
    open.stop();
    closed.stop();
  });

  it('who is signed in is asked at each emission: the same watch changes with the next change, and a new watch with it at once', async () => {
    const reading = watched<LessonSummary[]>((l) => services().lessons.watchLessons(l));
    await vi.waitFor(() => expect(reading.last()).toHaveLength(1));
    admin = true;
    await store.put('lessons', { ...hidden, title: 'Hidden again' });
    await vi.waitFor(() => expect(reading.last()).toHaveLength(2));
    admin = false;
    const again = watched<LessonSummary[]>((l) => services().lessons.watchLessons(l));
    await vi.waitFor(() => expect(again.last()).toHaveLength(1));
    reading.stop();
    again.stop();
  });
});

describe('the lesson of a class', () => {
  const lessonOf = () => watched<Lesson | null>((l) => services().seatView.watchLesson('x', l));

  it('a let-in seat gets it without its key, even unpublished', async () => {
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    const reading = lessonOf();
    await vi.waitFor(() => expect(reading.last()?.id).toBe('l2'));
    expect(reading.last()?.slides).toHaveLength(4);
    expectNoKey(reading.seen);
    reading.stop();
  });

  it('a waiting device, a removed device and a visitor get null', async () => {
    const visitor = lessonOf();
    await vi.waitFor(() => expect(visitor.seen).toEqual([null]));
    await store.put('participants', seatOf(seatId, 'g1', 's1', false));
    const waiting = lessonOf();
    await vi.waitFor(() => expect(waiting.seen).toEqual([null]));
    visitor.stop();
    waiting.stop();
  });

  it('a seat that is removed stops receiving it', async () => {
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    const reading = lessonOf();
    await vi.waitFor(() => expect(reading.last()?.id).toBe('l2'));
    await store.remove('participants', seatId);
    await vi.waitFor(() => expect(reading.last()).toBeNull());
    reading.stop();
  });

  it('the admin gets it raw', async () => {
    admin = true;
    const reading = lessonOf();
    await vi.waitFor(() => expect(reading.last()).toEqual(hidden));
    reading.stop();
  });
});

describe('the folders a caller receives', () => {
  const foldersSeen = () => watched<LessonFolder[]>((l) => services().folders.watchFolders(l));

  it('a signed-out caller gets only folders that hold a published lesson, and never the name of another', async () => {
    const reading = foldersSeen();
    await vi.waitFor(() => expect(reading.last()?.map((f) => f.id)).toEqual(['f1']));
    expect(JSON.stringify(reading.seen)).not.toContain('Secret folder');
    reading.stop();
  });

  it('follows the lessons: publishing a lesson shows its folder', async () => {
    const reading = foldersSeen();
    await vi.waitFor(() => expect(reading.last()?.map((f) => f.id)).toEqual(['f1']));
    await store.put('lessons', { ...hidden, published: true });
    await vi.waitFor(() => expect(reading.last()?.map((f) => f.id)).toEqual(['f1', 'f2']));
    reading.stop();
  });

  it('the admin gets every folder', async () => {
    admin = true;
    const reading = foldersSeen();
    await vi.waitFor(() => expect(reading.last()?.map((f) => f.id)).toEqual(['f1', 'f2']));
    reading.stop();
  });
});
