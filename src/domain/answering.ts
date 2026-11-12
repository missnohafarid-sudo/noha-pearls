import { countedGroups, presentStudents } from './attendance';
import { acceptsChanges } from './sessions';
import type { Answer, AnswerScope, AttendedRoster, ChoiceSlide, Id, Participant, QuestionSlide, Session, Slide, SubjectRef } from './models';
import { cleanText } from './text';

/** The single home for the rules of answering: who may answer what, and when. */

export const MAX_TEXT_ANSWER_LENGTH = 600;

export function isQuestion(slide: Slide): slide is QuestionSlide {
  return slide.kind === 'choice' || slide.kind === 'text';
}

export function isRevealed(session: Session, slideId: Id): boolean {
  return slideId in session.reveals;
}

/** Answers may be given and changed until the teacher reveals the question. */
export function canAnswer(session: Session, slide: Slide): slide is QuestionSlide {
  return acceptsChanges(session) && isQuestion(slide) && !isRevealed(session, slide.id);
}

export function subjectKey(subject: SubjectRef): string {
  return `${subject.kind}:${subject.id}`;
}

function sameSubject(a: SubjectRef, b: SubjectRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Who a device answers for on a given question. A shared group device
 * (no student chosen) can only answer group questions, hence the null.
 */
export function subjectFor(slide: QuestionSlide, device: { groupId: Id; studentId: Id | null }): SubjectRef | null {
  if (slide.scope === 'group') return { kind: 'group', id: device.groupId };
  return device.studentId ? { kind: 'student', id: device.studentId } : null;
}

/** One answer per subject per question, so the id is derived, not random. */
export function answerId(sessionId: Id, slideId: Id, subject: SubjectRef): Id {
  return `${sessionId}:${slideId}:${subjectKey(subject)}`;
}

/** Returns the value in its stored form, or null when it is not a valid answer to this question. */
export function normalizeAnswerValue(slide: QuestionSlide, value: unknown): number | string | null {
  if (slide.kind === 'choice') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < slide.options.length
      ? value
      : null;
  }
  if (typeof value !== 'string') return null;
  return cleanText(value, MAX_TEXT_ANSWER_LENGTH);
}

export function findAnswer(answers: readonly Answer[], slideId: Id, subject: SubjectRef | null): Answer | null {
  if (!subject) return null;
  return answers.find((a) => a.slideId === slideId && sameSubject(a.subject, subject)) ?? null;
}

/** Whose answer a question of this scope takes: a student's or a group's. */
export function subjectKindOf(scope: AnswerScope): SubjectRef['kind'] {
  return scope === 'group' ? 'group' : 'student';
}

export interface AnswerTally {
  answered: number;
  /** The present students, or the groups that count for a group question. */
  expected: number;
  /** Those of them who have not answered yet. */
  waiting: { id: Id; name: string }[];
}

/** The people a question counts: the present students, or for a group question the groups `countedGroups` names. */
export function countedSubjects(
  slide: QuestionSlide,
  roster: AttendedRoster,
  participants: readonly Participant[],
  answers: readonly Answer[],
): { id: Id; name: string }[] {
  if (slide.scope === 'individual') return presentStudents(roster);
  const answered = new Set(answers.filter((a) => a.slideId === slide.id && a.subject.kind === 'group').map((a) => a.subject.id));
  return countedGroups(roster, participants, answered);
}

/** How far a question has been answered by the people who count. */
export function tallyAnswerers(
  slide: QuestionSlide,
  roster: AttendedRoster,
  participants: readonly Participant[],
  answers: readonly Answer[],
): AnswerTally {
  const counted = countedSubjects(slide, roster, participants, answers);
  const kind = subjectKindOf(slide.scope);
  const waiting = counted.filter(({ id }) => findAnswer(answers, slide.id, { kind, id }) === null);
  return { answered: counted.length - waiting.length, expected: counted.length, waiting };
}

/**
 * Cards answer for one student each, so they fit individual choice questions only:
 * on a group question every member's card would overwrite the group's single answer.
 */
export function canScanCards(session: Session, slide: Slide): slide is ChoiceSlide {
  return canAnswer(session, slide) && slide.kind === 'choice' && slide.scope === 'individual';
}

/** Entering an answer by hand steps through: none, first option, …, last option, none. */
export function nextManualChoice(current: number | null, optionCount: number): number | null {
  if (current === null) return 0;
  return current + 1 < optionCount ? current + 1 : null;
}
