import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answers, hearts, lesson, live, roster, seatOf } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import type { DocumentStore } from '../ports/store';
import { NotAuthorizedError } from './AuthService';
import { createDataServices } from './createDataServices';
import type { ServiceClasses } from './Services';

let store: LocalDocumentStore;
let admin = false;
const caller: Caller = { isAdmin: () => admin, deviceId: () => 'd1' };

/** Each read only the teacher may make, started on the services as built. */
const GUARDED: [string, (s: ServiceClasses, listener: (value: unknown) => void) => unknown][] = [
  ['sessions.watchAll', (s, l) => s.sessions.watchAll(l)],
  ['sessionRoster.watchRoster', (s, l) => s.sessionRoster.watchRoster('x', l)],
  ['participants.watchParticipants', (s, l) => s.participants.watchParticipants('x', l)],
  ['answers.watchAnswers', (s, l) => s.answers.watchAnswers('x', l)],
  ['rewards.watchRewards', (s, l) => s.rewards.watchRewards('x', l)],
  ['roster.watchClasses', (s, l) => s.roster.watchClasses(l)],
  ['roster.watchRoster', (s, l) => s.roster.watchRoster('c1', l)],
  ['retention.watchSettings', (s, l) => s.retention.watchSettings(l)],
  ['retention.watchNotices', (s, l) => s.retention.watchNotices(l)],
  ['roster.exportToText', (s) => s.roster.exportToText('c1', 'header')],
];

const WATCHES = GUARDED.filter(([name]) => name.includes('.watch'));

/** The store with a count of the watchers still open on it. */
function withOpenCount(inner: DocumentStore): { store: DocumentStore; open: () => number } {
  let open = 0;
  const store: DocumentStore = Object.create(inner, {
    watch: {
      value: (...args: Parameters<DocumentStore['watch']>) => {
        open += 1;
        const stop = inner.watch(...args);
        let closed = false;
        return () => {
          if (!closed) open -= 1;
          closed = true;
          stop();
        };
      },
    },
  });
  return { store, open: () => open };
}

beforeEach(async () => {
  admin = false;
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', live);
  await store.put('lessons', lesson);
  await store.put('rosters', roster);
  await Promise.all(answers.map((a) => store.put('answers', a)));
  await Promise.all(hearts.map((h) => store.put('rewards', h)));
});

async function outcome(read: () => unknown): Promise<unknown> {
  try {
    return await read();
  } catch (error) {
    return error;
  }
}

describe.each(GUARDED)('%s', (_name, read) => {
  it('refuses a signed-out caller', async () => {
    const listener = vi.fn();
    expect(await outcome(() => read(createDataServices(store, caller), listener))).toBeInstanceOf(NotAuthorizedError);
    expect(listener).not.toHaveBeenCalled();
  });

  it('refuses a device the teacher let in', async () => {
    await store.put('participants', seatOf('x:d1', 'g1', 's1'));
    const listener = vi.fn();
    expect(await outcome(() => read(createDataServices(store, caller), listener))).toBeInstanceOf(NotAuthorizedError);
    expect(listener).not.toHaveBeenCalled();
  });

  it('refuses a waiting device', async () => {
    await store.put('participants', seatOf('x:d1', 'g1', 's1', false));
    expect(await outcome(() => read(createDataServices(store, caller), vi.fn()))).toBeInstanceOf(NotAuthorizedError);
  });

  it('still works for the admin', async () => {
    admin = true;
    const listener = vi.fn();
    const result = await outcome(() => read(createDataServices(store, caller), listener));
    expect(result).not.toBeInstanceOf(Error);
    if (typeof result === 'function') result();
  });
});

describe.each(WATCHES)('%s once the caller signs out', (_name, read) => {
  it('delivers nothing further and closes its sources', async () => {
    admin = true;
    const counted = withOpenCount(store);
    const listener = vi.fn();
    const stop = read(createDataServices(counted.store, caller), listener) as () => void;
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    const delivered = listener.mock.calls.length;
    admin = false;
    await store.put('classes', { id: 'c9', name: 'New', order: 9 });
    await store.put('groups', { id: 'g9', classId: 'c1', name: 'New', color: '#000', order: 9 });
    await store.put('students', { id: 's9', name: 'New', cardNumber: 9, groupId: 'g9' });
    await store.put('sessions', { ...live, id: 'y', code: 'XYZ234' });
    await store.put('rosters', { ...roster, id: 'x' });
    await store.put('participants', seatOf('x:d2', 'g1', 's1'));
    await store.put('answers', answers[0]);
    await store.put('rewards', hearts[0]);
    await store.put('retention', { id: 'retention', yearEnd: null, yearEndSetAt: 0, lastClearedAt: null });
    await vi.waitFor(() => expect(counted.open()).toBe(0));
    expect(listener).toHaveBeenCalledTimes(delivered);
    stop();
  });
});

describe('what the admin receives', () => {
  it('every class, the roster, every seat, every answer and every heart', async () => {
    admin = true;
    const services = createDataServices(store, caller);
    const seen: Record<string, unknown> = {};
    const stops = [
      services.sessions.watchAll((v) => (seen.sessions = v)),
      services.sessionRoster.watchRoster('x', (v) => (seen.roster = v)),
      services.answers.watchAnswers('x', (v) => (seen.answers = v)),
      services.rewards.watchRewards('x', (v) => (seen.rewards = v)),
    ];
    await vi.waitFor(() => expect(Object.keys(seen)).toHaveLength(4));
    expect(seen.sessions).toEqual([live]);
    expect(seen.roster).toEqual(roster);
    expect(seen.answers).toHaveLength(answers.length);
    expect(seen.rewards).toHaveLength(hearts.length);
    stops.forEach((stop) => stop());
  });
});
