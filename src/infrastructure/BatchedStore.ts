import type { Id } from '../domain/models';
import type { CollectionName, Collections, DocumentStore } from '../ports/store';

/** One change to stored data. */
export type Write = {
  [C in CollectionName]: { kind: 'put'; collection: C; doc: Collections[C] } | { kind: 'remove'; collection: C; id: Id };
}[CollectionName];

/** A store that can apply several writes at once, all or none, and then tell its watchers once. */
export interface BatchedStore extends DocumentStore {
  apply(writes: readonly Write[]): void;
}
