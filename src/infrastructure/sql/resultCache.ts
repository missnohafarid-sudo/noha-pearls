import type { CollectionName, Collections, Where } from '../../ports/store';
import { MAX_CACHE_KEY_LENGTH } from '../../ports/limits';
import { isConcerned, type Change, type Subject } from './watches';

interface Entry extends Subject {
  docs: readonly Collections[CollectionName][];
}

const MAX_ENTRIES = 256;

/** The key of one question: a collection and a filter, with the filter's fields in a fixed order; null when the question is too long to be remembered. */
function keyOf(collection: CollectionName, where: object): string | null {
  const fields = Object.entries(where).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const key = `${collection}\u0000${JSON.stringify(fields)}`;
  return key.length > MAX_CACHE_KEY_LENGTH ? null : key;
}

/**
 * The answers to recent questions of one collection and filter. It is correct only because every write to the database goes
 * through the store that owns it, which forgets the answers a write could change (`forget`). The documents are shared, so
 * a reader must not change them; the store hands out the list as a new array.
 */
export class ResultCache {
  private readonly entries = new Map<string, Entry>();

  get<C extends CollectionName>(collection: C, where: Where<Collections[C]>): Collections[C][] | undefined {
    const key = keyOf(collection, where);
    const found = key === null ? undefined : this.entries.get(key)?.docs;
    return found && ([...found] as Collections[C][]);
  }

  put<C extends CollectionName>(collection: C, where: Where<Collections[C]>, owner: Subject['owner'], docs: readonly Collections[C][]): void {
    const key = keyOf(collection, where);
    if (key === null) return;
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(key, { collection, owner, docs });
  }

  /** Drops every remembered answer that one of the changes could alter. */
  forget(changes: readonly Change[]): void {
    for (const [key, entry] of this.entries) if (changes.some((change) => isConcerned(entry, change))) this.entries.delete(key);
  }
}
