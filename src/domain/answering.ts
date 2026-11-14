import { countedGroups, isPresent, presentStudents } from './attendance';
import { acceptsChanges } from './sessions';
import type { Answer, AnswerScope, AttendedRoster, ChoiceSlide, Group, Id, Participant, QuestionSlide, Session, Slide, Student, SubjectRef } from './models';
import { membersOf, studentById } from './roster';
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
 * Who a device answers for on a given question: the student on an individual question, the group on a group
 * question. A shared group device (no student chosen) always answers for its group; `effectiveAnswer` says
 * how that group answer stands for the students of an individual question.
 */
export function subjectFor(slide: QuestionSlide, device: { groupId: Id; studentId: Id | null }): SubjectRef {
  return slide.scope === 'individual' && device.studentId
    ? { kind: 'student', id: device.studentId }
    : { kind: 'group', id: device.groupId };
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

/** Where the answer that counts for a student came from: her own, or her group's shared device. */
export type AnswerFrom = 'own' | 'group';

export interface EffectiveAnswer {
  answer: Answer;
  from: AnswerFrom;
}

/**
 * The answer that counts for a student on an individual question: her own, whenever it arrives, else her group's
 * (the group she is in on the roster now) when she is present. An absent student is never covered by it.
 * The one place that decides "own, else group"; every reader of individual answers asks it.
 */
export function effectiveAnswer(
  roster: AttendedRoster,
  answers: readonly Answer[],
  slide: QuestionSlide,
  studentId: Id,
): EffectiveAnswer | null {
  if (slide.scope !== 'individual') return null;
  const own = findAnswer(answers, slide.id, { kind: 'student', id: studentId });
  if (own) return { answer: own, from: 'own' };
  const student = studentById(roster.students, studentId);
  if (!student || !isPresent(roster, studentId)) return null;
  const shared = findAnswer(answers, slide.id, { kind: 'group', id: student.groupId });
  return shared ? { answer: shared, from: 'group' } : null;
}

export interface DeviceAnswer {
  answer: Answer;
  /** True when a named student is shown her group's answer because she gave none of her own. */
  coveredByGroup: boolean;
}

/** What a device shows as the answer that currently counts for it: its student's effective answer, or its group's own answer for a shared device and on a group question. */
export function deviceAnswer(
  roster: AttendedRoster,
  answers: readonly Answer[],
  slide: QuestionSlide,
  device: { groupId: Id; studentId: Id | null },
): DeviceAnswer | null {
  if (device.studentId && slide.scope === 'individual') {
    const found = effectiveAnswer(roster, answers, slide, device.studentId);
    return found && { answer: found.answer, coveredByGroup: found.from === 'group' };
  }
  const answer = findAnswer(answers, slide.id, subjectFor(slide, device));
  return answer && { answer, coveredByGroup: false };
}

/** Whether this device's answer stands for all the students of its group: a shared device on an individual question. */
export function answersForWholeGroup(slide: QuestionSlide, device: { studentId: Id | null }): boolean {
  return slide.scope === 'individual' && device.studentId === null;
}

export interface AnswerTally {
  answered: number;
  /** The present students, or the groups that count for a group question. */
  expected: number;
  /** Those of them who have not answered yet. */
  waiting: { id: Id; name: string }[];
}

export interface CountedAnswer {
  id: Id;
  name: string;
  /** What counts for her (or for the group): null while nothing does. */
  answer: Answer | null;
}

function countedStudents(slide: QuestionSlide, roster: AttendedRoster, answers: readonly Answer[]): CountedAnswer[] {
  return presentStudents(roster).map(({ id, name }) => ({ id, name, answer: effectiveAnswer(roster, answers, slide, id)?.answer ?? null }));
}

/** Whether an individual question has an answer that counts for some present student: the one rule `tallyAnswerers` and the interactions both ask. */
export function isAnswered(slide: QuestionSlide, roster: AttendedRoster, answers: readonly Answer[]): boolean {
  return countedStudents(slide, roster, answers).some(({ answer }) => answer !== null);
}

/**
 * The people a question counts, each with the answer that counts for her: the present students (own answer, else her
 * group's), or for a group question the groups `countedGroups` names.
 */
export function countedAnswers(
  slide: QuestionSlide,
  roster: AttendedRoster,
  participants: readonly Participant[],
  answers: readonly Answer[],
): CountedAnswer[] {
  if (slide.scope === 'individual') return countedStudents(slide, roster, answers);
  const answered = new Set(answers.filter((a) => a.slideId === slide.id && a.subject.kind === 'group').map((a) => a.subject.id));
  return countedGroups(roster, participants, answered).map(({ id, name }) => ({
    id,
    name,
    answer: findAnswer(answers, slide.id, { kind: 'group', id }),
  }));
}

/** How far a question has been answered by the people who count. */
export function tallyAnswerers(
  slide: QuestionSlide,
  roster: AttendedRoster,
  participants: readonly Participant[],
  answers: readonly Answer[],
): AnswerTally {
  const counted = countedAnswers(slide, roster, participants, answers);
  const waiting = counted.filter(({ answer }) => answer === null).map(({ id, name }) => ({ id, name }));
  return { answered: counted.length - waiting.length, expected: counted.length, waiting };
}

/** Where a counted group or student stands on the question on screen. */
export type AnswerMark = 'answered' | 'waiting';

export interface StudentAnswerStatus {
  student: Student;
  present: boolean;
  /** Null when the question does not count her: no question, a group question, or she is absent. */
  mark: AnswerMark | null;
}

export interface GroupAnswerStatus {
  group: Group;
  /** Null when the question does not count the group: no question, an individual question, or a group no one counts. */
  mark: AnswerMark | null;
  /** In card number order. */
  students: StudentAnswerStatus[];
}

/** Who has answered the slide on screen, group by group, over the people `tallyAnswerers` counts: the marks 'waiting' are exactly its `waiting`. */
export function answerStatusByGroup(
  slide: Slide | undefined,
  roster: AttendedRoster,
  participants: readonly Participant[],
  answers: readonly Answer[],
): GroupAnswerStatus[] {
  const question = slide && isQuestion(slide) ? slide : null;
  const kind = question && subjectKindOf(question.scope);
  const counted = new Map<Id, Answer | null>(
    question ? countedAnswers(question, roster, participants, answers).map(({ id, answer }) => [id, answer] as const) : [],
  );
  const markOf = (subjectKind: SubjectRef['kind'], id: Id): AnswerMark | null => {
    if (kind !== subjectKind || !counted.has(id)) return null;
    return counted.get(id) ? 'answered' : 'waiting';
  };
  return roster.groups.map((group) => ({
    group,
    mark: markOf('group', group.id),
    students: membersOf(group.id, roster.students)
      .sort((a, b) => a.cardNumber - b.cardNumber)
      .map((student) => ({ student, present: isPresent(roster, student.id), mark: markOf('student', student.id) })),
  }));
}

/**
 * Open questions that take an answer for one student at a time (a card, a hand entry, a name moved on a shared device):
 * individual choice questions only, since on a group question each of them would overwrite the group's single answer.
 */
export function takesAnswerPerStudent(session: Session, slide: Slide): slide is ChoiceSlide {
  return canAnswer(session, slide) && isPerStudentChoice(slide);
}

/** Whether the question is an individual choice one, open or not: the only kind whose answers are given one student at a time. */
export function isPerStudentChoice(slide: Slide): slide is ChoiceSlide {
  return slide.kind === 'choice' && slide.scope === 'individual';
}

/** Entering an answer by hand steps through: none, first option, …, last option, none. */
export function nextManualChoice(current: number | null, optionCount: number): number | null {
  if (current === null) return 0;
  return current + 1 < optionCount ? current + 1 : null;
}

/**
 * The next option of a hand entry, stepping from what counts for her now. A student covered by her group steps on from her
 * group's option and wraps round to the first, never to "none": her own answer is the one stored, and clearing it would change nothing.
 */
export function nextManualChoiceFor(found: EffectiveAnswer | null, optionCount: number): number | null {
  const current = typeof found?.answer.value === 'number' ? found.answer.value : null;
  return found?.from === 'group' && current !== null ? (current + 1) % optionCount : nextManualChoice(current, optionCount);
}
