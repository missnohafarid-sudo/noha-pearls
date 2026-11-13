import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Answer, ChoiceSlide, ContentSlide, Lesson, Session, TextSlide } from '../domain/models';
import { answer, heart, live, roster, seatOf } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { createDataServices } from './createDataServices';

let store: LocalDocumentStore;
const caller: Caller = { isAdmin: () => false, deviceId: () => 'd1' };
const services = () => createDataServices(store, caller);

const intro: ContentSlide = { id: 'c1', kind: 'content', title: 'Intro', tag: '', body: 'INTRO-BODY', images: ['https://pic.example/INTRO-PICTURE.png'], hidden: 'HIDDEN-TEXT' };
const pick: ChoiceSlide = {
  id: 'q1', kind: 'choice', title: 'Pick', tag: '', prompt: 'PROMPT-PICK', options: ['OPTION-A', 'OPTION-B', 'OPTION-C'], correctIndex: 1, explanation: 'EXPLANATION', scope: 'individual', points: 2,
};
const write: TextSlide = { id: 'q2', kind: 'text', title: 'Write', tag: '', prompt: 'PROMPT-WRITE', placeholder: 'PLACEHOLDER', images: ['https://pic.example/WRITE-PICTURE.png'], scope: 'individual', points: 1 };
const lesson: Lesson = { id: 'l1', folderId: null, title: 'Lesson', subject: 'Maths', grade: '7', published: true, slides: [intro, pick, write], updatedAt: 5 };
const revealed: Session = { ...live, reveals: { q1: { correctIndex: 1, explanation: 'EXPLANATION' } } };
const stored: Answer[] = [
  answer('q1', 'student', 's1', 0),
  answer('q1', 'student', 's2', 2),
  answer('q2', 'student', 's1', 'SARA-TEXT'),
  answer('q2', 'student', 's2', 'NOOR-SECRET-TEXT'),
  answer('q2', 'student', 's3', 'REEM-SECRET-TEXT'),
];

beforeEach(async () => {
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', revealed);
  await store.put('lessons', lesson);
  await store.put('rosters', { ...roster, present: ['s1', 's2'] });
  await store.put('participants', seatOf('x:d1', 'g1', 's1'));
  await store.put('participants', seatOf('x:d2', 'g1', 's2'));
  await Promise.all(stored.map((a) => store.put('answers', a)));
  await store.put('rewards', heart('student', 's1', 'teacher'));
});

const THINGS_OF_OTHERS = ['NOOR-SECRET-TEXT', 'REEM-SECRET-TEXT', '"present"', '"cardNumber"', 'x:d1', 'x:d2', '"joinedAt"', '"admitted"', '"deviceId"'];

async function emitted(start: (listener: (value: unknown) => void) => () => void): Promise<string> {
  const seen: unknown[] = [];
  const stop = start((value) => seen.push(value));
  await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
  await store.put('rewards', heart('student', 's2', 'peer'));
  await vi.waitFor(() => expect(seen.length).toBeGreaterThan(1));
  stop();
  return JSON.stringify(seen);
}

function expectNone(text: string, absent: readonly string[]) {
  for (const needle of absent) expect(text, needle).not.toContain(needle);
  expect(text).not.toMatch(/"correctIndex":\d/);
}

describe('what a let-in seat is given', () => {
  it('holds no other student\'s answer, roll, card number, seat or device id, and no key', async () => {
    const text = await emitted((l) => services().seatView.watchMine('x', l));
    expect(text).toContain('SARA-TEXT');
    expectNone(text, [...THINGS_OF_OTHERS, 'EXPLANATION']);
  });
});

describe('what the board gives anyone', () => {
  it('totals hold nothing of any student but her group\'s name, score and hearts', async () => {
    const text = await emitted((l) => services().board.watchTotals(live.code, l));
    expectNone(text, [...THINGS_OF_OTHERS, 'SARA-TEXT', 'PROMPT-PICK', 'EXPLANATION']);
  });

  it('a card\'s results hold no prompt, no option she did not choose, no picture, no hidden text and no key', async () => {
    const text = await emitted((l) => services().board.watchCardResults(live.code, 1, l));
    expect(text).toContain('SARA-TEXT');
    expect(text).toContain('OPTION-A');
    expectNone(text, [
      ...THINGS_OF_OTHERS, 'PROMPT-PICK', 'PROMPT-WRITE', 'OPTION-B', 'OPTION-C', 'pic.example', 'INTRO-BODY', 'HIDDEN-TEXT', 'PLACEHOLDER', 'EXPLANATION', '"images"', '"slide"',
    ]);
  });
});

describe('what a let-in seat of one class can read of another', () => {
  const hidden: Lesson = { ...lesson, id: 'l2', title: 'Hidden', published: false };

  beforeEach(async () => {
    await store.put('lessons', hidden);
    await store.put('sessions', { ...live, id: 'y', code: 'YYY234', lessonId: 'l2', classId: 'c2' });
    await store.put('rosters', { ...roster, id: 'y' });
    await store.put('answers', { ...answer('q1', 'student', 's1', 1), id: 'y:q1', sessionId: 'y' });
  });

  async function last<T>(start: (listener: (value: T) => void) => () => void): Promise<T> {
    const seen: T[] = [];
    const stop = start((value) => seen.push(value));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    stop();
    return seen[seen.length - 1];
  }

  it('gets nothing of the other class\'s lesson or view, and no unpublished lesson by its id', async () => {
    expect(await last((l) => services().seatView.watchLesson('y', l))).toBeNull();
    expect(await last((l) => services().seatView.watchMine('y', l))).toBeNull();
    expect(await last((l) => services().lessons.watchLesson('l2', l))).toBeNull();
  });

  it('still gets her own class\'s lesson', async () => {
    expect((await last<Lesson | null>((l) => services().seatView.watchLesson('x', l)))?.id).toBe('l1');
  });
});
