import { deviceAnswer, type DeviceAnswer } from './answering';
import { contestedRequestNumber, isAdmitted, namesHeldByOthers, seatAnswerer } from './admission';
import { RewardIndex, studentReport, type RewardTally, type StudentReport } from './analytics';
import { FolderTree } from './folders';
import { canViewLesson } from './lessonOps';
import type { Answer, ClassRoster, Group, Id, Lesson, LessonFolder, LessonSummary, Participant, Reward, Session, SessionRoster, Student } from './models';
import { messageFor } from './pacing';
import { resultsReport, type ResultsReport } from './resultRows';
import { peerRewardTargets } from './rewards';
import { memberViews, type MemberView } from './sharedDevice';
import { groupById, studentByCard, studentById } from './roster';
import { pearlsEarned, publishedKeys, questionSlides, scoreboard, type GroupScore } from './scoring';
import { liveSessions, openedParts } from './sessions';
import { slideKindSpec, withOpenedParts } from './slideKinds';

/**
 * The single home for what each kind of caller may read. It adds no arithmetic: it composes the rules that own
 * the numbers and decides which of their results, and how much of the data behind them, a caller receives.
 */

/** Who a let-in seat answers for right now (`seatAnswerer`). */
export type SeatRef = { groupId: Id; studentId: Id | null };

/** `seat` is the seat the teacher let in; a waiting or removed seat reads like a visitor. Her group is read from the roster she is shown with (`seatRef`). */
export interface Reader {
  isAdmin: boolean;
  seat: Participant | null;
}

export function readerOf(isAdmin: boolean, seat: Participant | null): Reader {
  return { isAdmin, seat: seat && isAdmitted(seat) ? seat : null };
}

/** The roster's students decide her group now: a student moved to another group reads as a member of it. */
export function seatRef(reader: Reader, students: readonly Pick<Student, 'id' | 'groupId'>[]): SeatRef | null {
  return reader.seat && seatAnswerer(reader.seat, students);
}

/**
 * The lesson without its own answer key: each slide kind says how (`SlideKindSpec.withoutKey`). Only what a reveal publishes
 * is removed; pictures and hidden sections are lesson content for students. Marking reads published keys only, so nothing a non-admin sees changes. Never apply it for the admin.
 */
export function withoutKey(lesson: Lesson): Lesson {
  return { ...lesson, slides: lesson.slides.map((slide) => slideKindSpec(slide.kind).withoutKey(slide)) };
}

/** What a student or visitor reads of a lesson: no key, and of the hidden parts only those `opened` names for a slide. */
function lessonForStudents(lesson: Lesson, opened: (slideId: Id) => readonly string[]): Lesson {
  const bare = withoutKey(lesson);
  return { ...bare, slides: bare.slides.map((slide) => withOpenedParts(slide, opened(slide.id))) };
}

export function lessonSummary(lesson: Lesson): LessonSummary {
  const { id, folderId, title, subject, grade, published, updatedAt, slides } = lesson;
  return { id, folderId, title, subject, grade, published, updatedAt, slideCount: slides.length, questionCount: questionSlides(lesson).length };
}

/** Newest first. */
export function lessonSummaries(lessons: readonly Lesson[]): LessonSummary[] {
  return lessons.map(lessonSummary).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function catalogueFor(isAdmin: boolean, lessons: readonly Lesson[]): LessonSummary[] {
  return lessonSummaries(lessons.filter((lesson) => canViewLesson(lesson, isAdmin)));
}

export function lessonFor(isAdmin: boolean, lesson: Lesson | null): Lesson | null {
  if (!lesson) return null;
  if (isAdmin) return lesson;
  return canViewLesson(lesson, false) ? lessonForStudents(lesson, () => []) : null;
}

/** A let-in seat reads her class's lesson even when it is not published, with the hidden parts the teacher has opened in that class; anyone else outside the admin gets none. */
export function classLessonFor(reader: Reader, lesson: Lesson | null, session: Session | null): Lesson | null {
  if (!lesson) return null;
  if (reader.isAdmin) return lesson;
  return reader.seat ? lessonForStudents(lesson, (slideId) => (session ? openedParts(session, slideId) : [])) : null;
}

/** A visitor's folders carry their SHOWN parent, so the tree she builds from them is the one the server shows. */
export function foldersFor(isAdmin: boolean, folders: readonly LessonFolder[], lessons: readonly Pick<Lesson, 'folderId' | 'published'>[]): LessonFolder[] {
  if (isAdmin) return [...folders];
  const tree = new FolderTree(folders);
  const visible = tree.visibleIds(lessons, false);
  return folders.filter((folder) => visible.has(folder.id)).map((folder) => ({ ...folder, parentId: tree.parentOf(folder.id) }));
}

export function sessionFor(reader: Reader, session: Session, students: readonly Pick<Student, 'id' | 'groupId'>[]): Session {
  if (reader.isAdmin) return session;
  const seat = seatRef(reader, students);
  return seat ? { ...session, message: messageFor(session, seat.groupId) } : { ...session, reveals: {}, message: null };
}

export function anyClassLive(sessions: readonly Session[]): boolean {
  return liveSessions(sessions).length > 0;
}

export type SeenStudent = Pick<Student, 'id' | 'name' | 'groupId'>;

/** What a device needs to pick a group and a name: no roll, no card numbers, no roster id. */
export interface SeenRoster {
  groups: Group[];
  students: SeenStudent[];
}

export function seenRoster(roster: ClassRoster): SeenRoster {
  return { groups: roster.groups, students: roster.students.map(({ id, name, groupId }) => ({ id, name, groupId })) };
}

/** Which names other devices hold, and the number that tells this seat's request apart; no seat ids leave the server. */
export interface NameClaims {
  heldByOthers: Id[];
  requestNumber: number | null;
}

export function nameClaims(participants: readonly Participant[], ownSeat: Participant | null): NameClaims {
  return {
    heldByOthers: [...namesHeldByOthers(participants, ownSeat?.id ?? null)],
    requestNumber: ownSeat && contestedRequestNumber(participants, ownSeat),
  };
}

/** Everything one class computes from; only the server holds all of it. */
export interface ClassData {
  session: Session;
  lesson: Lesson | null;
  roster: SessionRoster;
  answers: Answer[];
  rewards: Reward[];
  /** Only for computing what a let-in shared device shows (`seatView`): no reader is ever sent it. */
  participants: Participant[];
}

export interface BoardTotal extends GroupScore {
  group: Group;
  hearts: number;
}

export function boardTotals({ session, lesson, roster, answers, rewards }: ClassData): BoardTotal[] {
  if (!lesson) return [];
  const index = new RewardIndex(rewards);
  return scoreboard(lesson, roster, answers, publishedKeys(session)).flatMap((score) => {
    const group = groupById(roster.groups, score.groupId);
    return group ? [{ ...score, group, hearts: index.groupTotal(group, roster.students) }] : [];
  });
}

/** What the public board gives anyone who shows a card number: only what the results lines draw, never a slide. */
export interface CardResults {
  name: string;
  group: Group | null;
  report: ResultsReport;
  hearts: RewardTally;
}

function reportOf({ session, lesson, roster, answers }: ClassData, student: Student): StudentReport | null {
  return lesson && studentReport(withoutKey(lesson), session, roster, student, answers);
}

/** Null for a card no student holds, and while the class has no lesson. */
export function cardResults(data: ClassData, cardNumber: number): CardResults | null {
  const student = studentByCard(data.roster.students, cardNumber);
  const report = student && reportOf(data, student);
  if (!student || !report) return null;
  return {
    name: student.name,
    group: groupById(data.roster.groups, student.groupId),
    report: resultsReport(report),
    hearts: new RewardIndex(data.rewards).of({ kind: 'student', id: student.id }),
  };
}

export interface Classmate {
  id: Id;
  name: string;
  hearts: number;
}

/** Everything a let-in device shows that depends on other people's data, computed where that data is. */
export interface SeatView {
  seat: SeatRef;
  pearls: number;
  /** The answer that counts for her on each question slide; a slide with none has no entry. */
  answers: Record<Id, DeviceAnswer>;
  /** Named seats only. `report` is null while the class has no lesson. */
  own: { report: StudentReport | null; hearts: RewardTally } | null;
  /** The students she may give a heart to; none once the class has ended. */
  classmates: Classmate[];
  /**
   * A shared device only: the present students of its group it answers for, with the answer that counts for each on the
   * individual choice questions. This is the one deliberate widening: it sees the answers of the students it answers for,
   * and none of a student who answers on a device of her own. Empty for a named seat.
   */
  members: MemberView[];
}

/** The seat's group is read from the same roster as everything else in the view, so one emission never mixes two groupings. */
export function seatView(held: Participant, data: ClassData): SeatView {
  const { session, lesson, roster, answers, rewards, participants } = data;
  const seat = seatAnswerer(held, roster.students);
  const index = new RewardIndex(rewards);
  const group = boardTotals(data).find((total) => total.groupId === seat.groupId);
  const student = studentById(roster.students, seat.studentId);
  const shown = (lesson ? questionSlides(lesson) : []).flatMap((slide) => {
    const found = deviceAnswer(roster, answers, slide, seat);
    return found ? [[slide.id, found] as const] : [];
  });
  return {
    seat,
    pearls: group ? pearlsEarned(group) : 0,
    answers: Object.fromEntries(shown),
    own: student && { report: reportOf(data, student), hearts: index.of({ kind: 'student', id: student.id }) },
    classmates: peerRewardTargets(session, seat, roster.students).map(({ id, name }) => ({ id, name, hearts: index.of({ kind: 'student', id }).total })),
    members: memberViews(held, roster, participants, answers, lesson ? questionSlides(lesson) : []),
  };
}
