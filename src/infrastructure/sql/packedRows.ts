import type { Id } from '../../domain/models';
import { ownerSessionId } from '../../domain/retention';
import type { SqlDatabase } from '../../ports/sql';
import { type PackedCollection } from '../../ports/storageLayout';
import type { Collections, Where } from '../../ports/store';

type Packed<C extends PackedCollection> = Collections[C];
type Row<C extends PackedCollection> = Record<Id, Packed<C>>;

const SEPARATOR = ':';

/**
 * Collections kept one row per class session: the row holds all the class's documents of one collection.
 * The class a document belongs to comes from `ownerSessionId`; looking one up by id alone uses the
 * layout rule (see PACKED_COLLECTIONS): an id with a ':' starts with its class, an id without one is searched for.
 */
export class PackedRows {
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

  read<C extends PackedCollection>(collection: C, owner: Id): Row<C> {
    const [row] = this.db.all<{ body: string }>('SELECT body FROM packed_documents WHERE collection = ? AND owner = ?', collection, owner);
    return row ? (JSON.parse(row.body) as Row<C>) : {};
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
