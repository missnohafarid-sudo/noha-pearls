import { describe, expect, it, vi } from 'vitest';
import { lesson, live, roster } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { CollectionName, DocumentStore } from '../ports/store';
import { MAX_CARD_RESULTS_PER_CLASS } from '../ports/limits';
import { ClassFeeds, type ClassSnapshot } from './ClassFeeds';

async function counted() {
  const store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', live);
  await store.put('lessons', lesson);
  await store.put('rosters', roster);
  const opened: CollectionName[] = [];
  let open = 0;
  const watching: DocumentStore = {
    get: (collection, id) => store.get(collection, id),
    list: (collection, where) => store.list(collection, where),
    put: (collection, doc) => store.put(collection, doc),
    update: (collection, id, change) => store.update(collection, id, change),
    remove: (collection, id) => store.remove(collection, id),
    watch: (collection, where, listener) => {
      opened.push(collection);
      open += 1;
      const stop = store.watch(collection, where, listener);
      return () => {
        open -= 1;
        stop();
      };
    },
  };
  let dropOne: (error: unknown) => void = () => undefined;
  const feeds = new ClassFeeds((dropped) => {
    dropOne = dropped;
    return watching;
  });
  return { store, feeds, opened, openNow: () => open, dropOne: (error: unknown) => dropOne(error) };
}

describe('one read of a class for everyone who watches it', () => {
  it('opens the store once however many watch, gives all of them the same snapshot, and closes it when the last stops', async () => {
    const { store, feeds, opened, openNow } = await counted();
    const seen: ClassSnapshot[][] = Array.from({ length: 50 }, () => []);
    const stops = seen.map((into) => feeds.watch(live.id, (snapshot) => into.push(snapshot)));
    await vi.waitFor(() => expect(seen.every((into) => into.length > 0)).toBe(true));
    expect(opened).toHaveLength(6);
    await store.put('sessions', { ...live, slideIndex: 1 });
    await vi.waitFor(() => expect(seen.every((into) => into.at(-1)?.data?.session.slideIndex === 1)).toBe(true));
    expect(new Set(seen.map((into) => into.at(-1))).size).toBe(1);
    stops.slice(1).forEach((stop) => stop());
    expect(openNow()).toBe(6);
    stops[0]();
    expect(openNow()).toBe(0);
  });

  it('keeps only a bounded number of results per snapshot, however many card numbers are asked', async () => {
    const { feeds } = await counted();
    let snapshot: ClassSnapshot | undefined;
    feeds.watch(live.id, (next) => (snapshot = next));
    await vi.waitFor(() => expect(snapshot).toBeDefined());
    for (let card = 0; card < 1000; card += 1) snapshot!.shared.get(`card|${card}`, () => card);
    let recomputed = 0;
    for (let card = 1000 - MAX_CARD_RESULTS_PER_CLASS; card < 1000; card += 1) snapshot!.shared.get(`card|${card}`, () => (recomputed += 1));
    expect(recomputed).toBe(0);
    snapshot!.shared.get('card|0', () => (recomputed += 1));
    expect(recomputed).toBe(1);
  });

  it('tells a watcher whose listener fails, drops only it, and keeps serving the others', async () => {
    const { store, feeds } = await counted();
    const told: unknown[] = [];
    let healthy = 0;
    feeds.watch(live.id, () => healthy++);
    let arrived = 0;
    feeds.watch(live.id, () => {
      arrived += 1;
      if (arrived > 1) throw new Error('broken');
    }, (error) => told.push(error));
    await vi.waitFor(() => expect(arrived).toBe(1));
    await store.put('sessions', { ...live, slideIndex: 2 });
    await vi.waitFor(() => expect(told).toHaveLength(1));
    const before = healthy;
    await store.put('sessions', { ...live, slideIndex: 3 });
    await vi.waitFor(() => expect(healthy).toBeGreaterThan(before));
    expect(told).toHaveLength(1);
  });

  it('closes the store’s reads when the store gives up on one of them, and when the only listener fails', async () => {
    const gaveUp = await counted();
    const told: unknown[] = [];
    gaveUp.feeds.watch(live.id, () => undefined, (error) => told.push(error));
    await vi.waitFor(() => expect(gaveUp.openNow()).toBe(6));
    gaveUp.dropOne(new Error('the store dropped one read'));
    expect(told).toHaveLength(1);
    expect(gaveUp.openNow()).toBe(0);

    const failing = await counted();
    let arrived = 0;
    failing.feeds.watch(live.id, () => {
      arrived += 1;
      if (arrived > 1) throw new Error('broken listener');
    });
    await vi.waitFor(() => expect(arrived).toBe(1));
    await failing.store.put('sessions', { ...live, slideIndex: 2 });
    await vi.waitFor(() => expect(failing.openNow()).toBe(0));
  });
});
