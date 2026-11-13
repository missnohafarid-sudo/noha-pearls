import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contestedRequestNumber, namesHeldByOthers } from '../domain/admission';
import type { Participant } from '../domain/models';
import type { NameClaims, SeenRoster } from '../domain/visibility';
import { ended, groups, live, roster, students } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { ClassLookupService } from './ClassLookupService';
import { codesFor, participantsFor, rostersFor } from './serviceKit';

let store: LocalDocumentStore;

beforeEach(async () => {
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', live);
  await store.put('rosters', roster);
});

function watched<T>(start: (listener: (value: T) => void) => () => void) {
  const seen: T[] = [];
  const stop = start((value) => seen.push(value));
  return { seen, stop, last: () => seen.at(-1) };
}

const participantsRaw = () =>
  new Promise<Participant[]>((resolve) => {
    const stop = store.watch('participants', { sessionId: 'x' }, (docs) => {
      stop();
      resolve(docs);
    });
  });

const device = (deviceId: string) => {
  const caller: Caller = { isAdmin: () => false, deviceId: () => deviceId };
  return { caller, rosters: rostersFor(store, caller) };
};
const participantsOf = (deviceId: string) => {
  const { caller, rosters } = device(deviceId);
  return participantsFor(store, caller, rosters);
};

describe('the name claims of a class', () => {
  it('equal the names held by others and the request number, for two devices asking one name', async () => {
    const first = participantsOf('d1');
    const second = participantsOf('d2');
    const claims = watched<NameClaims>((l) => second.watchNameClaims(live.code, l));
    await vi.waitFor(() => expect(claims.last()).toEqual({ heldByOthers: [], requestNumber: null }));

    await first.join(live.code, 'g1', 's1');
    await vi.waitFor(() => expect(claims.last()).toEqual({ heldByOthers: ['s1'], requestNumber: null }));

    const own = await second.join(live.code, 'g1', 's1');
    const everyone = await participantsRaw();
    const expected = { heldByOthers: [...namesHeldByOthers(everyone, own?.id ?? null)], requestNumber: own && contestedRequestNumber(everyone, own) };
    expect(expected.requestNumber).not.toBeNull();
    await vi.waitFor(() => expect(claims.last()).toEqual(expected));
    claims.stop();
  });

  it('reveal no seat of another device', async () => {
    await participantsOf('d1').join(live.code, 'g1', 's1');
    const claims = watched<NameClaims>((l) => participantsOf('d2').watchNameClaims(live.code, l));
    await vi.waitFor(() => expect(claims.seen.length).toBeGreaterThan(0));
    expect(JSON.stringify(claims.last())).not.toContain('d1');
    claims.stop();
  });
});

describe('the seen roster', () => {
  it('has no roll and no card numbers, keeps the order, and follows a change', async () => {
    await store.put('rosters', { ...roster, present: ['s1'] });
    const seen = watched<SeenRoster>((l) => device('d1').rosters.watchSeen(live.code, l));
    await vi.waitFor(() => expect(seen.last()?.students).toHaveLength(3));
    expect(seen.last()).toEqual({ groups, students: students.map(({ id, name, groupId }) => ({ id, name, groupId })) });
    expect(JSON.stringify(seen.last())).not.toMatch(/cardNumber|present/);
    const added = { id: 's9', name: 'Lina', cardNumber: 9, groupId: 'g2' };
    await store.put('rosters', { ...roster, students: [...students, added], present: ['s1'] });
    await vi.waitFor(() => expect(seen.last()?.students.at(-1)).toEqual({ id: 's9', name: 'Lina', groupId: 'g2' }));
    seen.stop();
  });
});

describe('whether any class is live', () => {
  it('flips when a class ends and when another starts', async () => {
    const { caller, rosters } = device('d1');
    const lookup = new ClassLookupService(store, codesFor(store, caller), participantsFor(store, caller, rosters), rosters);
    const any = watched<boolean>((l) => lookup.watchAnyLive(l));
    await vi.waitFor(() => expect(any.last()).toBe(true));
    await store.put('sessions', ended);
    await vi.waitFor(() => expect(any.last()).toBe(false));
    await store.put('sessions', { ...live, id: 'y', code: 'XYZ234' });
    await vi.waitFor(() => expect(any.last()).toBe(true));
    any.stop();
  });
});
