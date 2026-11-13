import { effectiveAnswer, findAnswer, isQuestion } from './answering';
import { presentStudents } from './attendance';
import type { Answer, AnswerKey, AnswerScope, AttendedRoster, Id, Lesson, QuestionSlide, Session } from './models';
import { membersOf } from './roster';

/** The single home for marking answers and scoring groups. */

/** A score kept to one decimal. */
export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** What a reveal publishes. Only choice questions with a right answer have one to give. */
export function answerKey(slide: QuestionSlide): AnswerKey {
  return slide.kind === 'choice'
    ? { correctIndex: slide.correctIndex, explanation: slide.explanation }
    : { correctIndex: null, explanation: '' };
}

/**
 * `recorded` covers answers with no right or wrong: polls, predictions and free text.
 * `pending` means this viewer may not know the answer yet.
 */
export type Verdict = 'correct' | 'wrong' | 'recorded' | 'pending';

export function verdictOf(key: AnswerKey, value: number | string): Verdict {
  if (key.correctIndex === null) return 'recorded';
  return value === key.correctIndex ? 'correct' : 'wrong';
}

/** Where marking gets its key from; null means this viewer may not know the answer yet. */
export type KeySource = (slide: QuestionSlide) => AnswerKey | null;

/** The key the teacher revealed: what students and the public board may see. */
export function publishedKeys(session: Session): KeySource {
  return (slide) => session.reveals[slide.id] ?? null;
}

/** The revealed key when there is one, otherwise the lesson's own key. */
export function teacherKeys(session: Session): KeySource {
  return (slide) => session.reveals[slide.id] ?? answerKey(slide);
}

export function verdictFor(slide: QuestionSlide, answer: Answer, keys: KeySource): Verdict {
  const key = keys(slide);
  return key ? verdictOf(key, answer.value) : 'pending';
}

export type OptionMark = 'correct' | 'wrong' | 'selected' | 'idle';

/** How one option of a choice question is marked for a viewer, before (`key` null) and after the reveal. */
export function optionMark(key: AnswerKey | null, index: number, answer: number | string | null): OptionMark {
  if (key && key.correctIndex === index) return 'correct';
  if (key && key.correctIndex !== null && answer === index) return 'wrong';
  return answer === index ? 'selected' : 'idle';
}

export function pointsFor(slide: QuestionSlide, answer: Answer, keys: KeySource): number {
  const verdict = verdictFor(slide, answer, keys);
  return verdict === 'wrong' || verdict === 'pending' ? 0 : slide.points;
}

export function questionSlides(lesson: Lesson): QuestionSlide[] {
  return lesson.slides.filter(isQuestion);
}

function earned(slides: readonly QuestionSlide[], scope: AnswerScope, answerOf: (slide: QuestionSlide) => Answer | null, keys: KeySource): number {
  return slides
    .filter((slide) => slide.scope === scope)
    .reduce((sum, slide) => {
      const answer = answerOf(slide);
      return answer ? sum + pointsFor(slide, answer, keys) : sum;
    }, 0);
}

/** A student's points from the answers that count for her (`effectiveAnswer`): her own, else her group's. */
export function studentPoints(lesson: Lesson, roster: AttendedRoster, studentId: Id, answers: readonly Answer[], keys: KeySource): number {
  return earned(questionSlides(lesson), 'individual', (slide) => effectiveAnswer(roster, answers, slide, studentId)?.answer ?? null, keys);
}

export interface GroupScore {
  groupId: Id;
  /** Average of the present members' individual points plus the group's shared points. */
  score: number;
  max: number;
}

export function scoreboard(
  lesson: Lesson,
  roster: AttendedRoster,
  answers: readonly Answer[],
  keys: KeySource,
): GroupScore[] {
  const slides = questionSlides(lesson);
  const max = slides.reduce((sum, slide) => sum + slide.points, 0);
  const here = presentStudents(roster);
  return roster.groups.map((group) => {
    const members = membersOf(group.id, here);
    const individual = members.reduce((sum, s) => sum + studentPoints(lesson, roster, s.id, answers, keys), 0);
    const average = members.length > 0 ? individual / members.length : 0;
    const shared = earned(slides, 'group', (slide) => findAnswer(answers, slide.id, { kind: 'group', id: group.id }), keys);
    return { groupId: group.id, score: roundToTenth(average + shared), max };
  });
}

export interface RankedScore extends GroupScore {
  /** 1 is first place; equal scores share a rank. */
  rank: number;
}

/** Highest score first. */
export function rankScores<S extends GroupScore>(scores: readonly S[]): (S & { rank: number })[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return sorted.map((entry) => ({ ...entry, rank: sorted.findIndex((other) => other.score === entry.score) + 1 }));
}

/** A group's score is shown as a string of this many pearls. */
export const PEARL_COUNT = 7;

/** The share of the maximum score, rounded to whole pearls (a half rounds up). */
export function pearlsEarned({ score, max }: GroupScore): number {
  if (max <= 0) return 0;
  return Math.min(PEARL_COUNT, Math.max(0, Math.round((score / max) * PEARL_COUNT)));
}
