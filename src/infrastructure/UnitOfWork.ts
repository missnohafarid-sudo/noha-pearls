import type { Id } from '../domain/models';
import type { CollectionName, Collections, DocumentStore, Unsubscribe, Where } from '../ports/store';
import type { BatchedStore, Write } from './BatchedStore';
import { matchesWhere } from './matchesWhere';

/**
 * One command's view of the store. Its writes are kept in memory and its reads see them; `commit` applies them
 * all at once or not at all, and watchers hear of the result once. `rollback` forgets them. Services use it as an
 * ordinary `DocumentStore`.
 */
export class UnitOfWork implements DocumentStore {
  private readonly pending = new Map<string, Write>();

  constructor(private readonly base: BatchedStore) {}

  async get<C extends CollectionName>(collection: C, id: Id): Promise<Collections[C] | null> {
    const own = this.pending.get(this.key(collection, id));
    if (!own) return this.base.get(collection, id);
    return own.kind === 'put' ? (own.doc as Collections[C]) : null;
  }

  async list<C extends CollectionName>(collection: C, where: Where<Collections[C]> = {}): Promise<Collections[C][]> {
    const own = [...this.pending.values()].filter((write) => write.collection === collection);
    const untouched = (await this.base.list(collection, where)).filter((doc) => !this.pending.has(this.key(collection, doc.id)));
    const written = own.flatMap((write) => (write.kind === 'put' && matchesWhere<C>(write.doc as Collections[C], where) ? [write.doc as Collections[C]] : []));
    return [...untouched, ...written];
  }

  async put<C extends CollectionName>(collection: C, doc: Collections[C]): Promise<void> {
    this.pending.set(this.key(collection, doc.id), { kind: 'put', collection, doc } as Write);
  }

  async update<C extends CollectionName>(collection: C, id: Id, change: (current: Collections[C]) => Collections[C]): Promise<boolean> {
    const current = await this.get(collection, id);
    if (current === null) return false;
    const next = change(current);
    if (next !== current) await this.put(collection, next);
    return true;
  }

  async remove(collection: CollectionName, id: Id): Promise<void> {
    this.pending.set(this.key(collection, id), { kind: 'remove', collection, id });
  }

  /** Watchers see committed data only, never a command half done. */
  watch<C extends CollectionName>(collection: C, where: Where<Collections[C]>, listener: (docs: Collections[C][]) => void): Unsubscribe {
    return this.base.watch(collection, where, listener);
  }

  /** Applies every write in one transaction; if it fails nothing is applied, and the unit is finished either way. */
  commit(): void {
    const writes = [...this.pending.values()];
    this.pending.clear();
    this.base.apply(writes);
  }

  rollback(): void {
    this.pending.clear();
  }

  private key(collection: CollectionName, id: Id): string {
    return `${collection}/${id}`;
  }
}
