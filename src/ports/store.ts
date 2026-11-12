import type { Answer, ClassRecord, Group, Id, Lesson, LessonFolder, Participant, Reward, SchoolClass, RetentionSettings, Session, SessionRoster, SiteContent, Student, Teacher } from '../domain/models';

/**
 * The database as the application sees it: typed collections of documents with
 * live queries. The prototype implements it over browser storage; production
 * implements it over a hosted database (one table per collection). Services
 * depend on this interface only.
 */

export interface Collections {
  site: SiteContent;
  classes: SchoolClass;
  teachers: Teacher;
  groups: Group;
  students: Student;
  folders: LessonFolder;
  lessons: Lesson;
  sessions: Session;
  rosters: SessionRoster;
  participants: Participant;
  answers: Answer;
  rewards: Reward;
  records: ClassRecord;
  retention: RetentionSettings;
}

export type CollectionName = keyof Collections;

/**
 * How a collection takes part in deleting class data. `rank` orders removal inside a group, lowest first.
 * A session child belongs to one class and is removed with it; class data is emptied whole when the school year ends.
 */
type ClassDataRole =
  | { readonly role: 'session-child'; readonly rank: number }
  | { readonly role: 'class-data'; readonly rank: number }
  | { readonly role: 'kept' };

/** Every collection and what deleting class data does to it; the record type makes the compiler reject a missing or extra one. */
const CLASS_DATA_ROLES = {
  participants: { role: 'session-child', rank: 1 },
  answers: { role: 'session-child', rank: 2 },
  rewards: { role: 'session-child', rank: 3 },
  records: { role: 'session-child', rank: 4 },
  rosters: { role: 'session-child', rank: 5 },
  sessions: { role: 'class-data', rank: 1 },
  students: { role: 'class-data', rank: 2 },
  groups: { role: 'class-data', rank: 3 },
  classes: { role: 'class-data', rank: 4 },
  lessons: { role: 'kept' },
  folders: { role: 'kept' },
  teachers: { role: 'kept' },
  site: { role: 'kept' },
  retention: { role: 'kept' },
} as const satisfies Record<CollectionName, ClassDataRole>;

export const COLLECTION_NAMES = Object.keys(CLASS_DATA_ROLES) as CollectionName[];

type NamesWithRole<R extends ClassDataRole['role']> = {
  [C in CollectionName]: (typeof CLASS_DATA_ROLES)[C] extends { role: R } ? C : never;
}[CollectionName];

function inRemovalOrder<R extends 'session-child' | 'class-data'>(role: R): NamesWithRole<R>[] {
  const rank = (name: CollectionName) => {
    const entry: ClassDataRole = CLASS_DATA_ROLES[name];
    return entry.role === 'kept' ? 0 : entry.rank;
  };
  return COLLECTION_NAMES.filter((name) => CLASS_DATA_ROLES[name].role === role).sort((a, b) => rank(a) - rank(b)) as NamesWithRole<R>[];
}

/** What one class keeps, children first. The class itself (in `sessions`) is removed after them. */
export const SESSION_CHILD_COLLECTIONS = inRemovalOrder('session-child');

/** Everything the yearly clearing empties whole, in removal order: the children of classes, then the classes, students, groups and class lists. */
export const SCHOOL_YEAR_CLEARED_COLLECTIONS = [...SESSION_CHILD_COLLECTIONS, ...inRemovalOrder('class-data')];

/** Equality filter on top-level fields. */
export type Where<T> = Partial<T>;

export type Unsubscribe = () => void;

export interface DocumentStore {
  get<C extends CollectionName>(collection: C, id: Id): Promise<Collections[C] | null>;
  list<C extends CollectionName>(collection: C, where?: Where<Collections[C]>): Promise<Collections[C][]>;
  /** Inserts or replaces the document with the same id. */
  put<C extends CollectionName>(collection: C, doc: Collections[C]): Promise<void>;
  /** Applies `change` to the stored document in one step; false when it does not exist. A change that returns the document it was given writes and announces nothing. */
  update<C extends CollectionName>(collection: C, id: Id, change: (current: Collections[C]) => Collections[C]): Promise<boolean>;
  remove(collection: CollectionName, id: Id): Promise<void>;
  /** Calls `listener` with the current matches, then again after every change. */
  watch<C extends CollectionName>(
    collection: C,
    where: Where<Collections[C]>,
    listener: (docs: Collections[C][]) => void,
  ): Unsubscribe;
}
