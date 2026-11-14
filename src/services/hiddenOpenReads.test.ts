import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentSlide, Lesson } from '../domain/models';
import { HIDDEN_FENCE as F } from '../domain/slideText';
import { intro, lesson, live, roster, seatOf } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { NotAuthorizedError } from './AuthService';
import { createDataServices } from './createDataServices';

let store: LocalDocumentStore;
let admin = false;
const caller: Caller = { isAdmin: () => admin, deviceId: () => 'd1' };
const services = () => createDataServices(store, caller);

const parts: ContentSlide = { ...intro, id: 'p1', body: ['a', F, 'first', F, 'b'].join('\n'), hidden: 'the end' };
const deck: Lesson = { ...lesson, slides: [parts, ...lesson.slides.slice(1)] };
const SLIDE = 'p1';

beforeEach(async () => {
  admin = false;
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('lessons', deck);
  await store.put('sessions', live);
  await store.put('rosters', roster);
  await store.put('participants', seatOf('x:d1', 'g1', 's1'));
});

const openedInStore = async () => (await store.get('sessions', 'x'))?.hiddenOpen;

function watched<T>(start: (listener: (value: T) => void) => () => void) {
  const seen: T[] = [];
  const stop = start((value) => seen.push(value));
  return { last: () => seen.at(-1), stop };
}

const first = (read: Lesson | null | undefined) => read?.slides[0] as ContentSlide;

describe('opening a hidden part for the class', () => {
  it('is the admin\'s only', async () => {
    await expect(services().sessions.setHiddenOpen('x', SLIDE, 0, true)).rejects.toBeInstanceOf(NotAuthorizedError);
    expect(await openedInStore()).toBeUndefined();
  });

  it('opens and closes a part, once however often it is asked', async () => {
    admin = true;
    const { sessions } = services();
    await sessions.setHiddenOpen('x', SLIDE, 1, true);
    await sessions.setHiddenOpen('x', SLIDE, 1, true);
    await sessions.setHiddenOpen('x', SLIDE, 0, true);
    expect(await openedInStore()).toEqual({ p1: [0, 1] });
    await sessions.setHiddenOpen('x', SLIDE, 1, false);
    await sessions.setHiddenOpen('x', SLIDE, 1, false);
    expect(await openedInStore()).toEqual({ p1: [0] });
  });

  it('ignores a slide that is not in the lesson, a position the slide does not have and a class that is not there', async () => {
    admin = true;
    const { sessions } = services();
    await sessions.setHiddenOpen('x', 'nobody', 0, true);
    await sessions.setHiddenOpen('x', SLIDE, 2, true);
    await sessions.setHiddenOpen('x', 'q1', 0, true);
    await sessions.setHiddenOpen('nope', SLIDE, 0, true);
    expect(await openedInStore()).toBeUndefined();
  });

  it('changes nothing once the class has ended', async () => {
    admin = true;
    const { sessions } = services();
    await sessions.setHiddenOpen('x', SLIDE, 0, true);
    await sessions.end('x');
    await sessions.setHiddenOpen('x', SLIDE, 1, true);
    await sessions.setHiddenOpen('x', SLIDE, 0, false);
    expect(await openedInStore()).toEqual({ p1: [0] });
  });
});

describe('the hidden parts each reader receives', () => {
  it('gives the admin the whole slide', async () => {
    admin = true;
    const reading = watched<Lesson | null>((l) => services().seatView.watchLesson('x', l));
    await vi.waitFor(() => expect(first(reading.last())).toEqual(parts));
    reading.stop();
  });

  it('gives a let-in seat the parts as the teacher opens and closes them, as they change', async () => {
    admin = false;
    const reading = watched<Lesson | null>((l) => services().seatView.watchLesson('x', l));
    await vi.waitFor(() => expect(first(reading.last())).toMatchObject({ body: 'a\nb', hidden: '' }));
    admin = true;
    await services().sessions.setHiddenOpen('x', SLIDE, 0, true);
    await vi.waitFor(() => expect(first(reading.last())).toMatchObject({ body: parts.body, hidden: '' }));
    await services().sessions.setHiddenOpen('x', SLIDE, 1, true);
    await vi.waitFor(() => expect(first(reading.last())).toMatchObject({ body: parts.body, hidden: 'the end' }));
    await services().sessions.setHiddenOpen('x', SLIDE, 0, false);
    await vi.waitFor(() => expect(first(reading.last())).toMatchObject({ body: 'a\nb', hidden: 'the end' }));
    reading.stop();
  });

  it('gives a visitor of the published lesson no part, even one the class has opened', async () => {
    admin = true;
    await services().sessions.setHiddenOpen('x', SLIDE, 0, true);
    admin = false;
    const reading = watched<Lesson | null>((l) => services().lessons.watchLesson('l1', l));
    await vi.waitFor(() => expect(first(reading.last())).toMatchObject({ body: 'a\nb', hidden: '' }));
    expect(JSON.stringify(reading.last())).not.toContain('first');
    reading.stop();
  });
});
