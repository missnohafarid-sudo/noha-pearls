import type { Id } from '../../domain/models';
import { ownerSessionId } from '../../domain/retention';
import type { SqlDatabase } from '../../ports/sql';
import { type PackedCollection } from '../../ports/storageLayout';
import { MAX_REMEMBERED_ROWS } from '../../ports/limits';
import type { Collections, Where } from '../../ports/store';
import { Remembered } from './remembered';
import type { Change } from './watches';

type Packed<C extends PackedCollection> = Collections[C];
type Row<C extends PackedCollection> = Record<Id, Packed<C>>;

const SEPARATOR = ':';

/**
 * Collections kept one row per class session: the row holds all the class's documents of one collection.
 * The class a document belongs to comes from `ownerSessionId`; looking one up by id alone uses the
 * layout rule (see PACKED_COLLECTIONS): an id with a ':' starts with its class, an id without one is searched for.
 */
export class PackedRows {
  private readonly rows = new Remembered<Row<PackedCollection>>(MAX_REMEMBERED_ROWS);

  constructor(private readonly db: SqlDatabase) {}

  /** The class a lookup is about, if it names one: by `sessionId`, or by the start of an `id`. */
  ownerOfLookup<C extends PackedCollection>(where: Where<Packed<C>>): Id | undefined {
    const { sessionId, id } = where as { sessionId?: unknown; id?: unknown };
    if (typeof sessionId === 'string') return sessionId;
    return typeof id === 'string' && id.includes(SEPARATOR) ? id.slice(0, id.indexOf(SEPARATOR)) : undefined;
  }

  /** Refuses a document whose id would be looked for in the wrong class's row. */
  checkId<C extends PackedCollection>(doc: Packed<C>): void {
    const owner = ownerSessionId(doc);
    if (doc.id.includes(SEPARATOR) && this.ownerOfLookup({ id: doc.id } as Where<Packed<C>>) !== owner) {
      throw new Error(`The id "${doc.id}" must start with its class "${owner}:" or hold no ":".`);
    }
  }

  /** The class's row, read once however many ask until a write could change it (`forget`). The documents are shared: a caller must not change the row (`copyOf` for one that will). */
  read<C extends PackedCollection>(collection: C, owner: Id): Row<C> {
    const key = `${collection}\u0000${owner}`;
    const remembered = this.rows.get(key);
    if (remembered) return remembered as Row<C>;
    const [row] = this.db.all<{ body: string }>('SELECT body FROM packed_documents WHERE collection = ? AND owner = ?', collection, owner);
    if (!row) return {};
    const docs = JSON.parse(row.body) as Row<C>;
    this.rows.put(key, { collection, owner }, docs);
    return docs;
  }

  /** The class's row as a new object that its owner may add to and remove from. */
  copyOf<C extends PackedCollection>(collection: C, owner: Id): Row<C> {
    return { ...this.read(collection, owner) };
  }

  /** Forgets the rows a write could have changed. */
  forget(changes: readonly Change[]): void {
    this.rows.forget(changes);
  }

  readAll<C extends PackedCollection>(collection: C): Packed<C>[] {
    return this.db
      .all<{ body: string }>('SELECT body FROM packed_documents WHERE collection = ?', collection)
      .flatMap((row) => Object.values(JSON.parse(row.body) as Row<C>));
  }

  /** Replaces the class's row; a row left with no documents is deleted. */
  save<C extends PackedCollection>(collection: C, owner: Id, docs: Row<C>): void {
    if (Object.keys(docs).length === 0) {
      this.db.run('DELETE FROM packed_documents WHERE collection = ? AND owner = ?', collection, owner);
    } else {
      this.db.run('INSERT OR REPLACE INTO packed_documents (collection, owner, body) VALUES (?, ?, ?)', collection, owner, JSON.stringify(docs));
    }
  }

  /** The classes holding each of the ids that name no class; reads every row of the collection once. */
  searchOwners<C extends PackedCollection>(collection: C): Map<Id, Id> {
    const found = new Map<Id, Id>();
    for (const { owner, body } of this.db.all<{ owner: Id; body: string }>('SELECT owner, body FROM packed_documents WHERE collection = ?', collection)) {
      for (const id of Object.keys(JSON.parse(body) as Row<C>)) found.set(id, owner);
    }
    return found;
  }
}
