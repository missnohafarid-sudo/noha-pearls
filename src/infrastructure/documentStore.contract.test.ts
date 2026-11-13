import { describe, expect, it } from 'vitest';
import type { Group } from '../domain/models';
import type { DocumentStore } from '../ports/store';
import { LocalChangeBus, LocalDocumentStore } from './LocalDocumentStore';
import { SqlDocumentStore } from './SqlDocumentStore';
import { MemoryStorage } from './storage';
import { NodeSqlDatabase } from './testKit/NodeSqlDatabase';
import { UnitOfWork } from './UnitOfWork';

/** Every implementation of the `DocumentStore` port must pass these same cases, with the same expectations. */
const IMPLEMENTATIONS: Record<string, () => DocumentStore> = {
  LocalDocumentStore: () => new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'ns'),
  SqlDocumentStore: () => new SqlDocumentStore(new NodeSqlDatabase()),
  'UnitOfWork over SqlDocumentStore (committed after each command)': () => committing(new SqlDocumentStore(new NodeSqlDatabase())),
};

/** A store whose every call is its own unit of work, run one at a time as the hub runs commands, so it must behave as the store itself does. */
function committing(base: SqlDocumentStore): DocumentStore {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(command: (unit: UnitOfWork) => Promise<T>): Promise<T> => {
    const result = queue.then(async () => {
      const unit = new UnitOfWork(base);
      const value = await command(unit);
      unit.commit();
      return value;
    });
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    get: (collection, id) => run((unit) => unit.get(collection, id)),
    list: (collection, where) => run((unit) => unit.list(collection, where)),
    put: (collection, doc) => run((unit) => unit.put(collection, doc)),
    update: (collection, id, change) => run((unit) => unit.update(collection, id, change)),
    remove: (collection, id) => run((unit) => unit.remove(collection, id)),
    watch: (collection, where, listener) => base.watch(collection, where, listener),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const group = (id: string, name: string, color: string, order = 1): Group => ({ id, classId: 'c1', name, color, order });

describe.each(Object.entries(IMPLEMENTATIONS))('document store contract: %s', (_name, create) => {
  it('filters, replaces and notifies watchers', async () => {
    const store = create();
    const seen: number[] = [];
    const stop = store.watch('groups', { color: 'red' }, (docs) => seen.push(docs.length));
    await store.put('groups', group('a', 'أ', 'red'));
    await store.put('groups', group('b', 'ب', 'blue', 2));
    await store.put('groups', group('a', 'أأ', 'red'));
    await flush();
    stop();
    expect(seen.at(-1)).toBe(1);
    expect((await store.get('groups', 'a'))?.name).toBe('أأ');
    expect(await store.list('groups')).toHaveLength(2);
    await store.remove('groups', 'a');
    expect(await store.get('groups', 'a')).toBeNull();
  });

  it('answers a missing document with null and an unmatched filter with nothing', async () => {
    const store = create();
    expect(await store.get('groups', 'nope')).toBeNull();
    await store.put('groups', group('a', 'أ', 'red'));
    expect(await store.list('groups', { color: 'blue' })).toEqual([]);
    expect(await store.list('groups', { color: 'red', name: 'ب' })).toEqual([]);
    expect(await store.list('groups', { id: 'a', color: 'red' })).toHaveLength(1);
  });

  it('calls a watcher with the current matches, then after every change, and not after it stops', async () => {
    const store = create();
    await store.put('groups', group('a', 'أ', 'red'));
    const seen: number[] = [];
    const stop = store.watch('groups', {}, (docs) => seen.push(docs.length));
    await flush();
    await store.put('groups', group('b', 'ب', 'blue', 2));
    await flush();
    stop();
    await store.put('groups', group('c', 'ج', 'blue', 3));
    await flush();
    expect(seen).toEqual([1, 2]);
  });

  it('tells a watcher about its own collection only', async () => {
    const store = create();
    const seen: number[] = [];
    const stop = store.watch('groups', {}, (docs) => seen.push(docs.length));
    await flush();
    await store.put('classes', { id: 'c1', name: 'x', order: 1 });
    await flush();
    stop();
    expect(seen).toEqual([0]);
  });

  describe('update', () => {
    it('changes a stored document in one step and reports a missing one', async () => {
      const store = create();
      expect(await store.update('groups', 'x', (g) => ({ ...g, name: 'ب' }))).toBe(false);
      await store.put('groups', group('x', 'أ', 'red'));
      await Promise.all([
        store.update('groups', 'x', (g) => ({ ...g, name: 'ب' })),
        store.update('groups', 'x', (g) => ({ ...g, order: g.order + 1 })),
      ]);
      expect(await store.get('groups', 'x')).toMatchObject({ name: 'ب', order: 2 });
    });

    it('announces nothing when the change returns the document it was given', async () => {
      const store = create();
      await store.put('groups', group('x', 'أ', 'red'));
      const seen: string[] = [];
      const stop = store.watch('groups', {}, (docs) => seen.push(docs[0].name));
      await flush();
      expect(await store.update('groups', 'x', (current) => current)).toBe(true);
      await flush();
      expect(seen).toEqual(['أ']);
      await store.update('groups', 'x', (current) => ({ ...current, name: 'ج' }));
      await flush();
      stop();
      expect(seen).toEqual(['أ', 'ج']);
    });
  });

  describe('a class’s answers, seats and hearts', () => {
    const answer = (sessionId: string, n: number) =>
      ({ id: `${sessionId}:q${n}:s1`, sessionId, slideId: `q${n}`, subject: { kind: 'student', id: 's1' }, value: 1, source: 'device', at: n }) as const;

    it('keeps each class’s documents apart', async () => {
      const store = create();
      for (const n of [1, 2, 3]) await store.put('answers', answer('s-a', n));
      await store.put('answers', answer('s-b', 1));
      expect(await store.list('answers', { sessionId: 's-a' })).toHaveLength(3);
      expect(await store.list('answers', { sessionId: 's-b' })).toHaveLength(1);
      expect(await store.list('answers')).toHaveLength(4);
      expect(await store.get('answers', 's-b:q1:s1')).toMatchObject({ sessionId: 's-b' });
    });

    it('removes one document and leaves the rest of the class', async () => {
      const store = create();
      for (const n of [1, 2]) await store.put('answers', answer('s-a', n));
      await store.remove('answers', 's-a:q1:s1');
      expect((await store.list('answers', { sessionId: 's-a' })).map((a) => a.slideId)).toEqual(['q2']);
      await store.remove('answers', 's-a:q2:s1');
      expect(await store.list('answers', { sessionId: 's-a' })).toEqual([]);
    });

    it('finds and removes a heart by an id that names no class', async () => {
      const store = create();
      const heart = { id: 'abc123', sessionId: 's-a', target: { kind: 'student', id: 's1' }, source: 'teacher', at: 1 } as const;
      await store.put('rewards', heart);
      expect(await store.get('rewards', 'abc123')).toEqual(heart);
      await store.remove('rewards', 'abc123');
      expect(await store.list('rewards', { sessionId: 's-a' })).toEqual([]);
    });
  });
});
