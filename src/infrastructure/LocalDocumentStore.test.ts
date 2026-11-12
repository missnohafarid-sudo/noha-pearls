import { describe, expect, it, vi } from 'vitest';
import { LocalChangeBus, LocalDocumentStore, StorageEventChangeBus, type StorageEventSource } from './LocalDocumentStore';
import { MemoryStorage } from './storage';

function setup() {
  let fire: (event: StorageEvent) => void = () => {};
  const source: StorageEventSource = { addEventListener: (_type, listener) => (fire = listener) };
  const storage = new MemoryStorage();
  const store = new LocalDocumentStore(storage, new StorageEventChangeBus('ns', source), 'ns');
  const emit = (key: string | null) => fire({ key } as StorageEvent);
  return { storage, store, emit };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const group = { id: 'x', classId: 'c1', name: 'أ', color: 'red', order: 1 } as const;

describe('StorageEventChangeBus', () => {
  it('tells watchers about a change made in another tab', async () => {
    const { storage, store, emit } = setup();
    const seen: number[] = [];
    const stop = store.watch('groups', {}, (docs) => seen.push(docs.length));
    await flush();
    storage.setItem('ns/groups/x', JSON.stringify(group));
    emit('ns/groups/x');
    await flush();
    stop();
    expect(seen).toEqual([0, 1]);
  });

  it('ignores another namespace', async () => {
    const { storage, store, emit } = setup();
    const seen: number[] = [];
    const stop = store.watch('groups', {}, (docs) => seen.push(docs.length));
    await flush();
    storage.setItem('ns/groups/x', JSON.stringify(group));
    emit('other/groups/x');
    await flush();
    stop();
    expect(seen).toEqual([0]);
  });

  it('refreshes every watcher when another tab clears the storage', async () => {
    const { storage, store, emit } = setup();
    const seen: number[] = [];
    storage.setItem('ns/groups/x', JSON.stringify(group));
    const stop = store.watch('groups', {}, (docs) => seen.push(docs.length));
    await flush();
    storage.removeItem('ns/groups/x');
    emit(null);
    await flush();
    stop();
    expect(seen).toEqual([1, 0]);
  });

  it('still delivers within the writing tab', async () => {
    const store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'ns');
    const seen: number[] = [];
    const stop = store.watch('groups', {}, (docs) => seen.push(docs.length));
    await store.put('groups', group);
    await flush();
    stop();
    expect(seen.at(-1)).toBe(1);
  });
});

describe('update', () => {
  it('changes a stored document in one step and reports a missing one', async () => {
    const store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'ns');
    expect(await store.update('groups', 'x', (g) => ({ ...g, name: 'ب' }))).toBe(false);
    await store.put('groups', group);
    await Promise.all([
      store.update('groups', 'x', (g) => ({ ...g, name: 'ب' })),
      store.update('groups', 'x', (g) => ({ ...g, order: g.order + 1 })),
    ]);
    expect(await store.get('groups', 'x')).toMatchObject({ name: 'ب', order: 2 });
  });
});

describe('an update that changes nothing', () => {
  it('writes nothing and announces nothing when the change returns the document it was given', async () => {
    const storage = new MemoryStorage();
    const bus = new LocalChangeBus();
    const store = new LocalDocumentStore(storage, bus, 'ns');
    await store.put('groups', group);
    const writes = vi.spyOn(storage, 'setItem');
    const notices = vi.fn();
    bus.subscribe(notices);
    expect(await store.update('groups', 'x', (current) => current)).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    expect(notices).not.toHaveBeenCalled();
    await store.update('groups', 'x', (current) => ({ ...current, name: 'ج' }));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(notices).toHaveBeenCalledTimes(1);
  });
});
