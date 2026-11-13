import type { Id } from '../domain/models';
import type { CollectionName, Collections, DocumentStore, Unsubscribe, Where } from '../ports/store';

/**
 * A store as one connection's live reads see it: everything is the store's own, but each watch is opened with this connection's
 * way to hear that the store dropped it. The services that open the watches know nothing of it.
 */
export class WatchView implements DocumentStore {
  constructor(
    private readonly store: DocumentStore,
    private readonly dropped: (error: unknown) => void,
  ) {}

  get<C extends CollectionName>(collection: C, id: Id): Promise<Collections[C] | null> {
    return this.store.get(collection, id);
  }

  list<C extends CollectionName>(collection: C, where?: Where<Collections[C]>): Promise<Collections[C][]> {
    return this.store.list(collection, where);
  }

  put<C extends CollectionName>(collection: C, doc: Collections[C]): Promise<void> {
    return this.store.put(collection, doc);
  }

  update<C extends CollectionName>(collection: C, id: Id, change: (current: Collections[C]) => Collections[C]): Promise<boolean> {
    return this.store.update(collection, id, change);
  }

  remove(collection: CollectionName, id: Id): Promise<void> {
    return this.store.remove(collection, id);
  }

  watch<C extends CollectionName>(collection: C, where: Where<Collections[C]>, listener: (docs: Collections[C][]) => void): Unsubscribe {
    return this.store.watch(collection, where, listener, this.dropped);
  }
}
