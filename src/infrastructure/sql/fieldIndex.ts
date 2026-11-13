import type { Id } from '../../domain/models';
import type { SqlDatabase } from '../../ports/sql';
import { INDEXED_FIELDS } from '../../ports/storageLayout';
import type { CollectionName, Collections, Where } from '../../ports/store';
import { readMeta, writeMeta } from './schema';

const LAYOUT_KEY = 'index-layout';

type IndexedValue = string | number | boolean | null;
const isIndexable = (value: unknown): value is IndexedValue => value === null || ['string', 'number', 'boolean'].includes(typeof value);

const fieldsOf = (collection: CollectionName): readonly string[] => INDEXED_FIELDS[collection] ?? [];
const entry = (value: IndexedValue): string => JSON.stringify(value);

/** The values of a document's indexed fields; a field the document lacks has no entry. */
function indexedValues(collection: CollectionName, doc: Collections[CollectionName] | null): Map<string, string> {
  const values = new Map<string, string>();
  for (const field of fieldsOf(collection)) {
    const value = doc ? (doc as unknown as Record<string, unknown>)[field] : undefined;
    if (isIndexable(value)) values.set(field, entry(value));
  }
  return values;
}

/**
 * A small table of (collection, field, value, id) for the fields declared in INDEXED_FIELDS, so a filter on one
 * reads only the matching documents. An entry is written only when a document's value for the field changes.
 */
export class FieldIndex {
  constructor(private readonly db: SqlDatabase) {}

  /** Brings the table in line with INDEXED_FIELDS: rebuilt from the documents when the declared list has changed. */
  ensureCurrent(): void {
    const declared = JSON.stringify(INDEXED_FIELDS);
    if (readMeta(this.db, LAYOUT_KEY) === declared) return;
    this.db.transaction(() => {
      this.db.run('DELETE FROM field_index');
      for (const collection of Object.keys(INDEXED_FIELDS) as CollectionName[]) {
        for (const { body } of this.db.all<{ body: string }>('SELECT body FROM documents WHERE collection = ?', collection)) {
          this.change(collection, null, JSON.parse(body) as Collections[CollectionName]);
        }
      }
      writeMeta(this.db, LAYOUT_KEY, declared);
    });
  }

  isIndexed(collection: CollectionName): boolean {
    return fieldsOf(collection).length > 0;
  }

  /** Writes the entries that differ between the document as it was and as it is now; either may be null. */
  change(collection: CollectionName, before: Collections[CollectionName] | null, after: Collections[CollectionName] | null): void {
    const was = indexedValues(collection, before);
    const now = indexedValues(collection, after);
    const id = (after ?? before)?.id;
    if (id === undefined) return;
    for (const [field, value] of was) {
      if (now.get(field) !== value) this.db.run('DELETE FROM field_index WHERE collection = ? AND field = ? AND value = ? AND id = ?', collection, field, value, id);
    }
    for (const [field, value] of now) {
      if (was.get(field) !== value) this.db.run('INSERT INTO field_index (collection, field, value, id) VALUES (?, ?, ?, ?)', collection, field, value, id);
    }
  }

  /** The first indexed field the filter names, with the value it asks for; undefined when none can use the index. */
  pick<C extends CollectionName>(collection: C, where: Where<Collections[C]>): { field: string; value: IndexedValue } | undefined {
    const asked = where as Record<string, unknown>;
    const field = fieldsOf(collection).find((name) => name in asked && isIndexable(asked[name]));
    return field === undefined ? undefined : { field, value: asked[field] as IndexedValue };
  }

  /** The ids of the documents whose field holds `value`. */
  idsWith(collection: CollectionName, field: string, value: IndexedValue): Id[] {
    return this.db
      .all<{ id: Id }>('SELECT id FROM field_index WHERE collection = ? AND field = ? AND value = ?', collection, field, entry(value))
      .map((row) => row.id);
  }
}
