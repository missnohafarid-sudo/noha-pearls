import { canAnswer, effectiveAnswer, isAnswered } from './answering';
import { isPresent } from './attendance';
import type { Answer, AttendedRoster, Id, Lesson, QuestionSlide, Session } from './models';
import { questionSlides } from './scoring';

/**
 * The single home for a session's minimum of interactions and for who is unresponsive.
 * An interaction is the answer that counts for a student on an individual question (`effectiveAnswer`: her own, else her group's
 * shared device's); a group question's answer belongs to the group.
 * An individual question counts in a session while it still takes answers or once an answer counts for some present
 * student (`isAnswered`), so a question the class never got to, or that nobody who counts answered before it closed,
 * is held against no one.
 */

/** How many individual questions a student may leave unanswered before she is short of the default minimum. */
export const SPARE_INTERACTIONS = 2;

export function individualQuestions(lesson: Lesson): QuestionSlide[] {
  return questionSlides(lesson).filter((slide) => slide.scope === 'individual');
}

/** The individual questions that count in this session, in lesson order. */
export function countingQuestions(session: Session, lesson: Lesson, roster: AttendedRoster, answers: readonly Answer[]): QuestionSlide[] {
  return individualQuestions(lesson).filter((slide) => canAnswer(session, slide) || isAnswered(slide, roster, answers));
}

export function possibleInteractions(session: Session, lesson: Lesson, roster: AttendedRoster, answers: readonly Answer[]): number {
  return countingQuestions(session, lesson, roster, answers).length;
}

function defaultMinimum(possible: number): number {
  return Math.max(0, possible - SPARE_INTERACTIONS);
}

function clamped(possible: number, value: number): number {
  return Math.min(possible, Math.max(0, Math.round(value)));
}

/** The minimum the session asks for: the one the teacher set (absent in the default and in older sessions), else the default, within what can be answered. */
export function minInteractions(session: Session, lesson: Lesson, roster: AttendedRoster, answers: readonly Answer[]): number {
  const possible = possibleInteractions(session, lesson, roster, answers);
  return clamped(possible, session.minInteractions ?? defaultMinimum(possible));
}

/**
 * The session with the teacher's minimum applied. A value that is not a finite number changes nothing.
 * The default is not stored, so it goes on following the questions that count.
 */
export function withMinInteractions(session: Session, lesson: Lesson, roster: AttendedRoster, answers: readonly Answer[], value: number): Session {
  if (!Number.isFinite(value)) return session;
  const possible = possibleInteractions(session, lesson, roster, answers);
  const wanted = clamped(possible, value);
  const { minInteractions: _replaced, ...rest } = session;
  return wanted === defaultMinimum(possible) ? rest : { ...rest, minInteractions: wanted };
}

/** How many individual questions this student has answered, from any source. */
export function interactionsOf(lesson: Lesson, roster: AttendedRoster, answers: readonly Answer[], studentId: Id): number {
  return individualQuestions(lesson).filter((slide) => effectiveAnswer(roster, answers, slide, studentId) !== null).length;
}

/**
 * A present student who can no longer reach the minimum, counting the questions she may still answer.
 * While the class runs this is true only once it is certain; after it ended, exactly when she answered fewer
 * of the questions that counted. An absent student is never flagged.
 */
export function isUnresponsive(session: Session, lesson: Lesson, roster: AttendedRoster, answers: readonly Answer[], studentId: Id): boolean {
  if (!isPresent(roster, studentId)) return false;
  const reachable = countingQuestions(session, lesson, roster, answers).filter((slide) => effectiveAnswer(roster, answers, slide, studentId) !== null || canAnswer(session, slide));
  return reachable.length < minInteractions(session, lesson, roster, answers);
}
