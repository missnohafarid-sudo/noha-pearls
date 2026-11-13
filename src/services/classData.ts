import type { Id, Lesson, Session } from '../domain/models';
import type { ClassData } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { combineWatches, followWatch, type Watch } from './combineWatches';
import { NO_ROSTER } from './SessionRosterSource';

/**
 * Everything one class computes from, live: its session, the lesson the session names (followed when that changes),
 * its roster, answers and hearts. Null while the session is not stored.
 */
export function watchClassData(store: DocumentStore, sessionId: Id, listener: (data: ClassData | null) => void): Unsubscribe {
  const session: Watch<Session | null> = (emit) => store.watch('sessions', { id: sessionId }, (docs) => emit(docs[0] ?? null));
  const lessonOf = (found: Session | null): Watch<Lesson | null> => (emit) => store.watch('lessons', { id: found?.lessonId ?? '' }, (docs) => emit(docs[0] ?? null));
  const sessionAndLesson = followWatch(session, (found) => found?.lessonId ?? '', lessonOf);
  const roster: Watch<ClassData['roster']> = (emit) => store.watch('rosters', { id: sessionId }, (docs) => emit(docs[0] ?? NO_ROSTER));
  const answers: Watch<ClassData['answers']> = (emit) => store.watch('answers', { sessionId }, emit);
  const rewards: Watch<ClassData['rewards']> = (emit) => store.watch('rewards', { sessionId }, emit);
  return combineWatches([sessionAndLesson, roster, answers, rewards], ([found, lesson], rosterNow, answersNow, rewardsNow) =>
    listener(found && { session: found, lesson, roster: rosterNow, answers: answersNow, rewards: rewardsNow }),
  );
}
