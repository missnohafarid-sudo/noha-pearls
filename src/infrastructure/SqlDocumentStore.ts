import type { Id } from '../domain/models';
import { ownerSessionId } from '../domain/retention';
import type { SqlDatabase } from '../ports/sql';
import { isPacked, type PackedCollection } from '../ports/storageLayout';
import type { CollectionName, Collections, Unsubscribe, Where } from '../ports/store';
import type { BatchedStore, Write } from './BatchedStore';
import { DocumentRows } from './sql/documentRows';
import { FieldIndex } from './sql/fieldIndex';
import { isUsableFilter, matchesWhere } from './matchesWhere';
import { PackedRows } from './sql/packedRows';
import { ResultCache } from './sql/resultCache';
import { migrate } from './sql/schema';
import { type Change, Watches } from './sql/watches';

/** The packed rows a batch of writes has read and changed so far, saved together at its end. */
type OpenRows = Map<string, { collection: PackedCollection; owner: Id; docs: Record<Id, Collections[PackedCollection]> }>;

/**
 * The database as documents in SQL rows. Collections that hold many small documents for one class are packed, one
 * row per class (see `PACKED_COLLECTIONS`); the rest are one row per document; filters on the fields of
 * `INDEXED_FIELDS` read through a small index. Every write goes through `apply`: one transaction, then watchers hear of it.
 * The hub is the only writer, so the answer to a question is kept until a write that could change it (see `ResultCache`).
 */
export class SqlDocumentStore implements BatchedStore {
  private readonly documents: DocumentRows;
  private readonly packed: PackedRows;
  private readonly index: FieldIndex;
  private readonly watches: Watches;
  private readonly results = new ResultCache();

  /** `report` hears of every watcher that failed and was dropped. */
  constructor(
    private readonly db: SqlDatabase,
    report: (error: unknown) => void = (error) => console.error(error),
  ) {
    this.watches = new Watches(report);
    migrate(db);
    this.documents = new DocumentRows(db);
    this.packed = new PackedRows(db);
    this.index = new FieldIndex(db);
    this.index.ensureCurrent();
  }

  async get<C extends CollectionName>(collection: C, id: Id): Promise<Collections[C] | null> {
    return this.read(collection, id);
  }

  async list<C extends CollectionName>(collection: C, where: Where<Collections[C]> = {}): Promise<Collections[C][]> {
    return this.query(collection, where);
  }

  async put<C extends CollectionName>(collection: C, doc: Collections[C]): Promise<void> {
    this.apply([{ kind: 'put', collection, doc } as Write]);
  }

  async update<C extends CollectionName>(collection: C, id: Id, change: (current: Collections[C]) => Collections[C]): Promise<boolean> {
    const current = this.read(collection, id);
    if (current === null) return false;
    const next = change(current);
    if (next !== current) this.apply([{ kind: 'put', collection, doc: next } as Write]);
    return true;
  }

  async remove(collection: CollectionName, id: Id): Promise<void> {
    this.apply([{ kind: 'remove', collection, id }]);
  }

  watch<C extends CollectionName>(collection: C, where: Where<Collections[C]>, listener: (docs: Collections[C][]) => void, dropped?: (error: unknown) => void): Unsubscribe {
    const run = () => listener(this.query(collection, where));
    const owner = isPacked(collection) ? this.packed.ownerOfLookup(where) : undefined;
    const stop = this.watches.add({ collection, owner, run, dropped });
    try {
      run();
    } catch (error) {
      stop();
      throw error;
    }
    return stop;
  }

  apply(writes: readonly Write[]): void {
    const changes = this.db.transaction(() => this.writeAll(writes));
    this.results.forget(changes);
    this.watches.notify(changes);
  }

  private read<C extends CollectionName>(collection: C, id: Id): Collections[C] | null {
    if (typeof id !== 'string') return null;
    if (!isPacked(collection)) return this.documents.get(collection, id);
    const owner = this.packed.ownerOfLookup({ id }) ?? this.packed.searchOwners(collection).get(id);
    return owner === undefined ? null : ((this.packed.read(collection, owner)[id] ?? null) as Collections[C] | null);
  }

  /** Reads as little as the filter allows: one document, one class's row, the index's matches, or the whole collection. */
  private query<C extends CollectionName>(collection: C, where: Where<Collections[C]>): Collections[C][] {
    if (!isUsableFilter(where)) return [];
    const remembered = this.results.get(collection, where);
    if (remembered) return remembered;
    const found = this.candidates(collection, where).filter((doc) => matchesWhere<C>(doc, where));
    this.results.put(collection, where, isPacked(collection) ? this.packed.ownerOfLookup(where) : undefined, found);
    return [...found];
  }

  private candidates<C extends CollectionName>(collection: C, where: Where<Collections[C]>): Collections[C][] {
    const { id } = where as { id?: string };
    if (id !== undefined) return [this.read(collection, id)].filter((doc) => doc !== null);
    if (isPacked(collection)) {
      const owner = this.packed.ownerOfLookup(where);
      return (owner === undefined ? this.packed.readAll(collection) : Object.values(this.packed.read(collection, owner))) as Collections[C][];
    }
    const lookup = this.index.pick(collection, where);
    return lookup ? this.documents.byIds(collection, this.index.idsWith(collection, lookup.field, lookup.value)) : this.documents.all(collection);
  }

  private writeAll(writes: readonly Write[]): Change[] {
    const open: OpenRows = new Map();
    const owners = new Map<PackedCollection, Map<Id, Id>>();
    const changes = writes.map((write) => (isPacked(write.collection) ? this.writePacked(write, open, owners) : this.writeDocument(write)));
    open.forEach(({ collection, owner, docs }) => this.packed.save(collection, owner, docs));
    return changes.filter((change) => change !== null);
  }

  private writeDocument(write: Write): Change {
    const { collection } = write;
    const id = write.kind === 'put' ? write.doc.id : write.id;
    const before = this.index.isIndexed(collection) ? this.documents.get(collection, id) : null;
    if (write.kind === 'put') this.documents.put(collection, write.doc);
    else this.documents.remove(collection, id);
    this.index.change(collection, before, write.kind === 'put' ? write.doc : null);
    return { collection };
  }

  private writePacked(write: Write, open: OpenRows, searched: Map<PackedCollection, Map<Id, Id>>): Change | null {
    const collection = write.collection as PackedCollection;
    const id = write.kind === 'put' ? write.doc.id : write.id;
    if (write.kind === 'put') this.packed.checkId(write.doc as Collections[PackedCollection]);
    const owner =
      write.kind === 'put'
        ? ownerSessionId(write.doc as Collections[PackedCollection])
        : (this.packed.ownerOfLookup({ id }) ?? this.searchedOwner(collection, id, searched));
    if (owner === undefined) return null;
    const key = `${collection}\u0000${owner}`;
    const row = open.get(key) ?? { collection, owner, docs: this.packed.read(collection, owner) };
    open.set(key, row);
    if (write.kind === 'put') row.docs[id] = write.doc as Collections[PackedCollection];
    else delete row.docs[id];
    return { collection, owner };
  }

  private searchedOwner(collection: PackedCollection, id: Id, searched: Map<PackedCollection, Map<Id, Id>>): Id | undefined {
    const known = searched.get(collection) ?? this.packed.searchOwners(collection);
    searched.set(collection, known);
    return known.get(id);
  }
}
