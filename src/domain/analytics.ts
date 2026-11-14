import { admittedDevices } from './admission';
import { isPresent } from './attendance';
import { countedAnswers, effectiveAnswer, findAnswer, subjectKey, type EffectiveAnswer } from './answering';
import { individualQuestions, interactionsOf, isUnresponsive } from './engagement';
import type {
  Answer,
  AttendedRoster,
  ChoiceSlide,
  Group,
  Id,
  Lesson,
  Participant,
  QuestionSlide,
  Reward,
  RewardSource,
  Session,
  Student,
  SubjectRef,
} from './models';
import { membersOf } from './roster';
import {
  pointsFor,
  publishedKeys,
  questionSlides,
  scoreboard,
  studentPoints,
  verdictFor,
  type KeySource,
  type Verdict,
} from './scoring';

/** Read models for the live results, the monitor and the reward board. Pure aggregation. */

export function answersForSlide(answers: readonly Answer[], slideId: Id): Answer[] {
  return answers.filter((a) => a.slideId === slideId);
}

/** Number of answers per option, in option order, from the people the question counts (so the bars add up to the total shown). */
export function tallyChoices(slide: ChoiceSlide, roster: AttendedRoster, participants: readonly Participant[], answers: readonly Answer[]): number[] {
  const counts = slide.options.map(() => 0);
  for (const { answer } of countedAnswers(slide, roster, participants, answers)) {
    if (answer && typeof answer.value === 'number' && answer.value in counts) counts[answer.value] += 1;
  }
  return counts;
}

export interface MonitorCell {
  slide: QuestionSlide;
  answer: Answer | null;
  verdict: Verdict | 'none';
  /** True when the answer is her group's shared device's, not her own. Never true for a group question's cell. */
  byGroup: boolean;
}

export interface MonitorRow {
  student: Student;
  joined: boolean;
  /** False when a roll was taken and she is not on it: she is absent, not merely silent. */
  present: boolean;
  points: number;
  /** How many individual questions she has answered. */
  answered: number;
  /** Present, and short of the session's minimum of interactions beyond reach. */
  unresponsive: boolean;
  /** One cell per individual question, in lesson order. */
  cells: MonitorCell[];
}

export interface MonitorGroup {
  group: Group;
  score: number;
  maxScore: number;
  rows: MonitorRow[];
  /** One cell per group question, in lesson order. */
  groupCells: MonitorCell[];
}

function cell(slide: QuestionSlide, answer: Answer | null, byGroup: boolean, keys: KeySource): MonitorCell {
  return { slide, answer, verdict: answer ? verdictFor(slide, answer, keys) : 'none', byGroup };
}

function studentCell(slide: QuestionSlide, found: EffectiveAnswer | null, keys: KeySource): MonitorCell {
  return cell(slide, found?.answer ?? null, found?.from === 'group', keys);
}

export function buildMonitor(
  lesson: Lesson,
  session: Session,
  roster: AttendedRoster,
  answers: readonly Answer[],
  participants: readonly Participant[],
  keys: KeySource,
): MonitorGroup[] {
  const individual = individualQuestions(lesson);
  const shared = questionSlides(lesson).filter((s) => s.scope === 'group');
  const joined = new Set(admittedDevices(participants).map((p) => p.studentId));
  const scores = new Map(scoreboard(lesson, roster, answers, keys).map((s) => [s.groupId, s]));

  return roster.groups.map((group) => ({
    group,
    score: scores.get(group.id)?.score ?? 0,
    maxScore: scores.get(group.id)?.max ?? 0,
    rows: membersOf(group.id, roster.students)
      .sort((a, b) => a.cardNumber - b.cardNumber)
      .map((student) => ({
        student,
        joined: joined.has(student.id),
        present: isPresent(roster, student.id),
        points: studentPoints(lesson, roster, student.id, answers, keys),
        answered: interactionsOf(lesson, roster, answers, student.id),
        unresponsive: isUnresponsive(session, lesson, roster, answers, student.id),
        cells: individual.map((slide) => studentCell(slide, effectiveAnswer(roster, answers, slide, student.id), keys)),
      })),
    groupCells: shared.map((slide) => cell(slide, findAnswer(answers, slide.id, { kind: 'group', id: group.id }), false, keys)),
  }));
}

export interface StudentResult {
  slide: QuestionSlide;
  answer: Answer | null;
  verdict: Verdict | 'none';
  /** True when the answer is her group's shared device's, not her own. */
  byGroup: boolean;
}

export interface StudentReport {
  /** Points of revealed questions only, so the total never leaks an unrevealed result. */
  points: number;
  /** One result per individual question, in lesson order. */
  results: StudentResult[];
}

/** What a student may see of her own results, over the answers that count for her. */
export function studentReport(
  lesson: Lesson,
  session: Session,
  roster: AttendedRoster,
  student: Student,
  answers: readonly Answer[],
): StudentReport {
  const keys = publishedKeys(session);
  let points = 0;
  const results = individualQuestions(lesson).map((slide): StudentResult => {
    const found = effectiveAnswer(roster, answers, slide, student.id);
    if (!found) return { slide, answer: null, verdict: 'none', byGroup: false };
    points += pointsFor(slide, found.answer, keys);
    return { slide, answer: found.answer, verdict: verdictFor(slide, found.answer, keys), byGroup: found.from === 'group' };
  });
  return { points, results };
}

export const REWARD_SOURCES: readonly RewardSource[] = ['teacher', 'peer', 'guest', 'supervisor'];

export interface RewardTally {
  /** Hearts given minus hearts still taken. */
  total: number;
  /** Plain given hearts, by who gave them. */
  bySource: Record<RewardSource, number>;
  /** Hearts taken and not yet returned. */
  taken: number;
}

function emptyTally(): RewardTally {
  const bySource = Object.fromEntries(REWARD_SOURCES.map((source) => [source, 0])) as Record<RewardSource, number>;
  return { total: 0, bySource, taken: 0 };
}

export class RewardIndex {
  private readonly tallies = new Map<string, RewardTally>();

  constructor(rewards: readonly Reward[]) {
    for (const reward of rewards) {
      const key = subjectKey(reward.target);
      const tally = this.tallies.get(key) ?? emptyTally();
      if (reward.effect === 'taken') {
        tally.total -= 1;
        tally.taken += 1;
      } else if (reward.effect === 'returned') {
        tally.total += 1;
        tally.taken -= 1;
      } else {
        tally.total += 1;
        tally.bySource[reward.source] += 1;
      }
      this.tallies.set(key, tally);
    }
  }

  of(subject: SubjectRef): RewardTally {
    return this.tallies.get(subjectKey(subject)) ?? emptyTally();
  }

  /** A group's hearts: those given to the group itself plus those given to its members, never below zero. */
  groupTotal(group: Pick<Group, 'id'>, students: readonly Pick<Student, 'id' | 'groupId'>[]): number {
    const sum = membersOf(group.id, students).reduce(
      (acc, s) => acc + this.of({ kind: 'student', id: s.id }).total,
      this.of({ kind: 'group', id: group.id }).total,
    );
    return Math.max(0, sum);
  }

  /** The count shown for a target: a student's own total, a group's `groupTotal`. */
  shownFor(target: SubjectRef, students: readonly Pick<Student, 'id' | 'groupId'>[]): number {
    return target.kind === 'group' ? this.groupTotal({ id: target.id }, students) : this.of(target).total;
  }
}
