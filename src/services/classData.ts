import type { Id, Lesson, Session } from '../domain/models';
import type { ClassData } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { ClassResolver } from './ClassResolver';
import { combineWatches, followWatch, noRead, type Watch } from './combineWatches';
import { NO_ROSTER } from './SessionRosterSource';

/** A class's session and the lesson it names, followed when the session names another; null for either while it is not stored. */
export function watchSessionAndLesson(store: DocumentStore, sessionId: Id): Watch<[Session | null, Lesson | null]> {
  const session: Watch<Session | null> = (emit) => store.watch('sessions', { id: sessionId }, (docs) => emit(docs[0] ?? null));
  const lessonOf = (found: Session | null): Watch<Lesson | null> => (emit) => store.watch('lessons', { id: found?.lessonId ?? '' }, (docs) => emit(docs[0] ?? null));
  return followWatch(session, (found) => found?.lessonId ?? '', lessonOf);
}

/**
 * Everything one class computes from, live: its session, the lesson the session names (followed when that changes),
 * its roster, answers and hearts. Null while the session is not stored.
 */
export function watchClassData(store: DocumentStore, sessionId: Id, listener: (data: ClassData | null) => void): Unsubscribe {
  const roster: Watch<ClassData['roster']> = (emit) => store.watch('rosters', { id: sessionId }, (docs) => emit(docs[0] ?? NO_ROSTER));
  const answers: Watch<ClassData['answers']> = (emit) => store.watch('answers', { sessionId }, emit);
  const rewards: Watch<ClassData['rewards']> = (emit) => store.watch('rewards', { sessionId }, emit);
  return combineWatches([watchSessionAndLesson(store, sessionId), roster, answers, rewards], ([found, lesson], rosterNow, answersNow, rewardsNow) =>
    listener(found && { session: found, lesson, roster: rosterNow, answers: answersNow, rewards: rewardsNow }),
  );
}

/**
 * Follows what a class code opens for this caller: `inner` is the live read of that class, `none` what a code that opens nothing reads as.
 * The read is closed and opened again when the code comes to open another class.
 */
export function watchByCode<T>(codes: ClassResolver, code: string, inner: (session: Session) => Watch<T>, none: T, listener: (value: T) => void): Unsubscribe {
  const named: Watch<Session | null> = (emit) => codes.watchSession(code, emit);
  const readOf = (session: Session | null): Watch<T> => (session ? inner(session) : noRead(none));
  return followWatch(named, (session) => session?.id ?? '', readOf)(([, value]) => listener(value));
}
