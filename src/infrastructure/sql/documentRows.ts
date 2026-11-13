import type { Id } from '../../domain/models';
import type { SqlDatabase } from '../../ports/sql';
import type { CollectionName, Collections } from '../../ports/store';

type Body = { body: string };

const IDS_PER_STATEMENT = 90;

/** Collections kept one document per row. */
export class DocumentRows {
  constructor(private readonly db: SqlDatabase) {}

  get<C extends CollectionName>(collection: C, id: Id): Collections[C] | null {
    const [row] = this.db.all<Body>('SELECT body FROM documents WHERE collection = ? AND id = ?', collection, id);
    return row ? (JSON.parse(row.body) as Collections[C]) : null;
  }

  all<C extends CollectionName>(collection: C): Collections[C][] {
    return this.db.all<Body>('SELECT body FROM documents WHERE collection = ?', collection).map((row) => JSON.parse(row.body) as Collections[C]);
  }

  /** The documents with these ids, a bounded number at a time (an engine limits the values one statement may bind). */
  byIds<C extends CollectionName>(collection: C, ids: readonly Id[]): Collections[C][] {
    const found: Collections[C][] = [];
    for (let start = 0; start < ids.length; start += IDS_PER_STATEMENT) {
      const chunk = ids.slice(start, start + IDS_PER_STATEMENT);
      const rows = this.db.all<Body>(`SELECT body FROM documents WHERE collection = ? AND id IN (${chunk.map(() => '?').join(', ')})`, collection, ...chunk);
      found.push(...rows.map((row) => JSON.parse(row.body) as Collections[C]));
    }
    return found;
  }

  put(collection: CollectionName, doc: Collections[CollectionName]): void {
    this.db.run('INSERT OR REPLACE INTO documents (collection, id, body) VALUES (?, ?, ?)', collection, doc.id, JSON.stringify(doc));
  }

  remove(collection: CollectionName, id: Id): void {
    this.db.run('DELETE FROM documents WHERE collection = ? AND id = ?', collection, id);
  }
}
