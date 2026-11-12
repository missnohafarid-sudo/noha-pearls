import type { Answer, ClassRecord, Group, Id, Lesson, LessonFolder, Participant, Reward, SchoolClass, Session, SessionRoster, SiteContent, Student, Teacher } from '../domain/models';

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
}

export type CollectionName = keyof Collections;

/** Every collection name; the record type makes the compiler reject a missing or extra one. */
const COLLECTION_FLAGS: Record<CollectionName, true> = {
  site: true,
  classes: true,
  teachers: true,
  groups: true,
  students: true,
  folders: true,
  lessons: true,
  sessions: true,
  rosters: true,
  participants: true,
  answers: true,
  rewards: true,
  records: true,
};
export const COLLECTION_NAMES = Object.keys(COLLECTION_FLAGS) as CollectionName[];

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
