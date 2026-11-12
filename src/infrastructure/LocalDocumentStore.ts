import type { Id } from '../domain/models';
import type { KeyValueStorage } from '../ports/storage';
import { COLLECTION_NAMES, type CollectionName, type Collections, DocumentStore, Unsubscribe, Where } from '../ports/store';

/** Tells every open tab that a collection changed. */
export interface ChangeBus {
  publish(collection: CollectionName): void;
  subscribe(listener: (collection: CollectionName) => void): Unsubscribe;
}

/** Same-tab delivery only; enough for tests. */
export class LocalChangeBus implements ChangeBus {
  protected readonly listeners = new Set<(collection: CollectionName) => void>();

  publish(collection: CollectionName): void {
    this.listeners.forEach((listener) => listener(collection));
  }

  subscribe(listener: (collection: CollectionName) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** The one home of the key layout: `${namespace}/${collection}/${id}`. */
function documentKey(namespace: string, collection: CollectionName, id: Id): string {
  return `${namespace}/${collection}/${id}`;
}

/** Reads the collection back out of a key; null for a key outside the namespace. */
function collectionOfKey(namespace: string, key: string): CollectionName | null {
  const prefix = `${namespace}/`;
  if (!key.startsWith(prefix)) return null;
  const collection = key.slice(prefix.length).split('/')[0];
  return collection ? (collection as CollectionName) : null;
}

/** Where `storage` events come from: the browser window. */
export interface StorageEventSource {
  addEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
}

/**
 * Adds delivery to the other tabs of this browser. The browser's `storage`
 * event reaches a tab only once the new value is readable there, so a watcher
 * never re-reads too early (a separate message channel gives no such order).
 */
export class StorageEventChangeBus extends LocalChangeBus {
  constructor(namespace: string, source: StorageEventSource) {
    super();
    source.addEventListener('storage', (event) => {
      // A null key means the storage was cleared: every collection may have changed.
      const changed = event.key === null ? COLLECTION_NAMES : [collectionOfKey(namespace, event.key)];
      for (const collection of changed) if (collection) super.publish(collection);
    });
  }
}

/**
 * Prototype database: one storage entry per document, change notices over a bus.
 * Every tab of the same browser sees the same data live, which stands in for
 * separate classroom devices until the hosted database adapter replaces it.
 */
export class LocalDocumentStore implements DocumentStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly bus: ChangeBus,
    private readonly namespace: string,
  ) {}

  async get<C extends CollectionName>(collection: C, id: Id): Promise<Collections[C] | null> {
    return this.read(collection, this.key(collection, id));
  }

  async list<C extends CollectionName>(collection: C, where: Where<Collections[C]> = {}): Promise<Collections[C][]> {
    const prefix = this.key(collection, '');
    const filters = Object.entries(where) as [keyof Collections[C], unknown][];
    return this.storage
      .keys()
      .filter((key) => key.startsWith(prefix))
      .map((key) => this.read(collection, key))
      .filter((doc): doc is Collections[C] => doc !== null && filters.every(([field, value]) => doc[field] === value));
  }

  async put<C extends CollectionName>(collection: C, doc: Collections[C]): Promise<void> {
    this.storage.setItem(this.key(collection, doc.id), JSON.stringify(doc));
    this.bus.publish(collection);
  }

  async update<C extends CollectionName>(
    collection: C,
    id: Id,
    change: (current: Collections[C]) => Collections[C],
  ): Promise<boolean> {
    // Read and write with no await between them, so overlapping updates cannot lose each other.
    const key = this.key(collection, id);
    const current = this.read<C>(collection, key);
    if (current === null) return false;
    const next = change(current);
    if (next !== current) {
      this.storage.setItem(key, JSON.stringify(next));
      this.bus.publish(collection);
    }
    return true;
  }

  async remove(collection: CollectionName, id: Id): Promise<void> {
    this.storage.removeItem(this.key(collection, id));
    this.bus.publish(collection);
  }

  watch<C extends CollectionName>(
    collection: C,
    where: Where<Collections[C]>,
    listener: (docs: Collections[C][]) => void,
  ): Unsubscribe {
    let active = true;
    const emit = () => {
      void this.list(collection, where).then((docs) => {
        if (active) listener(docs);
      });
    };
    const unsubscribe = this.bus.subscribe((changed) => {
      if (changed === collection) emit();
    });
    emit();
    return () => {
      active = false;
      unsubscribe();
    };
  }

  private key(collection: CollectionName, id: Id): string {
    return documentKey(this.namespace, collection, id);
  }

  private read<C extends CollectionName>(_collection: C, key: string): Collections[C] | null {
    const raw = this.storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as Collections[C]);
  }
}
