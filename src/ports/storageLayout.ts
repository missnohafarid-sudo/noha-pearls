import { SESSION_CHILD_COLLECTIONS, type CollectionName, type Collections } from './store';

/**
 * How a database that stores documents in rows lays them out: the one home of which collections are packed and
 * which fields are indexed.
 */

type SessionChild = (typeof SESSION_CHILD_COLLECTIONS)[number];

/**
 * Collections that hold many small documents for one class session. A database keeps all of a class's documents of
 * one of them together (one row), so reading or writing a class's answers touches one row, not hundreds.
 * A document id of such a collection either has no ':' or starts with `${sessionId}:`.
 */
export const PACKED_COLLECTIONS = ['participants', 'answers', 'rewards'] as const satisfies readonly SessionChild[];

export type PackedCollection = (typeof PACKED_COLLECTIONS)[number];

export const isPacked = (collection: CollectionName): collection is PackedCollection => (PACKED_COLLECTIONS as readonly string[]).includes(collection);

/**
 * The fields the services look documents up by in collections that can grow large. A filter on one of these reads
 * only the matching documents. Changing this list is safe: the database rebuilds its index when it sees a new list.
 */
export const INDEXED_FIELDS: { readonly [C in CollectionName]?: readonly (keyof Collections[C] & string)[] } = {
  sessions: ['code', 'status'],
  records: ['classId'],
  lessons: ['folderId'],
  students: ['groupId'],
};
