/** Entities of the classroom platform. Pure data: no behaviour, no I/O. */

export type Id = string;

export interface SiteContent {
  id: 'site';
  schoolName: string;
  title: string;
  tagline: string;
  intro: string;
}

/** A school class such as "11-3": the people who sit in one room. Its groups hold its students. */
export interface SchoolClass {
  id: Id;
  name: string;
  /** Position in every list of classes; lower comes first. */
  order: number;
}

/** A name picked from a list when a class starts. Not an account. */
export interface Teacher {
  id: Id;
  name: string;
  /** Position in every list of teachers; lower comes first, so a row stays where it was added while its name is typed. */
  order: number;
}

export interface Group {
  id: Id;
  classId: Id;
  name: string;
  color: string;
  /** Position in every list of groups; lower comes first. */
  order: number;
}

export interface Student {
  id: Id;
  /** Printed on the student's answer card; equals the card's marker id. */
  cardNumber: number;
  name: string;
  groupId: Id;
}

/** The groups of one class, and the students in them. */
export interface ClassRoster {
  groups: Group[];
  students: Student[];
}

/** A roster that knows who is here: `present` is null until a roll is taken, and then holds the students counted as here. */
export interface AttendedRoster extends ClassRoster {
  present: Id[] | null;
}

/** The groups and students one session works with: its own copy of its class's, made at the start with the same ids. Its id is the session's. */
export interface SessionRoster extends AttendedRoster {
  id: Id;
}

export type * from './lessonModels';

/**
 * How a group's devices move through the lesson:
 * follow = mirror the teacher, free = navigate on their own,
 * hold = screen frozen ("eyes on the teacher"), pinned = kept on one slide.
 */
export type PacingMode = 'follow' | 'free' | 'hold' | 'pinned';

export interface GroupPacing {
  mode: PacingMode;
  /** Only meaningful when `mode` is `pinned`. */
  slideIndex: number;
}

/** What the teacher publishes when revealing a question. */
export interface AnswerKey {
  correctIndex: number | null;
  explanation: string;
}

export interface TeacherMessage {
  id: Id;
  text: string;
  /** `null` addresses every group. */
  groupId: Id | null;
}

export interface Session {
  id: Id;
  /** Short code that appears in the join link and QR. */
  code: string;
  lessonId: Id;
  /** The class and the teacher, with their names as they were at the start, so an ended class still says whose it was. */
  classId: Id;
  className: string;
  teacherId: Id;
  teacherName: string;
  status: 'live' | 'ended';
  slideIndex: number;
  /** Answer keys by slide id, present once the teacher reveals them. */
  reveals: Record<Id, AnswerKey>;
  /** Pacing by group id; a missing entry means "follow". */
  pacing: Record<Id, GroupPacing>;
  message: TeacherMessage | null;
  /** The fewest individual questions a present student should answer; absent means the default. */
  minInteractions?: number;
  startedAt: number;
}

export interface SubjectRef {
  kind: 'student' | 'group';
  id: Id;
}

export type AnswerSource = 'device' | 'card' | 'manual';

export interface Answer {
  id: Id;
  sessionId: Id;
  slideId: Id;
  subject: SubjectRef;
  /** Option index for choice questions, text otherwise. */
  value: number | string;
  source: AnswerSource;
  at: number;
}

export type RewardSource = 'teacher' | 'peer' | 'guest' | 'supervisor';

/** One heart. Append-only, so totals are counted, never overwritten. */
export interface Reward {
  id: Id;
  sessionId: Id;
  target: SubjectRef;
  source: RewardSource;
  at: number;
}

/** A device that asked for a seat in a session. `studentId` is null for a shared group device. */
export interface Participant {
  id: Id;
  sessionId: Id;
  groupId: Id;
  studentId: Id | null;
  joinedAt: number;
  /** False until the teacher lets the device in; a waiting device sees no slide and cannot answer or give a heart. */
  admitted: boolean;
}

/** What one student did in one ended class. */
export interface StudentRecord {
  studentId: Id;
  name: string;
  groupId: Id;
  present: boolean;
  answered: number;
  points: number;
  unresponsive: boolean;
}

export interface GroupRecord {
  groupId: Id;
  name: string;
  score: number;
  max: number;
}

/** What an ended class came to, kept so that later changes to the lesson cannot change it. Its id is the session's. */
export interface ClassRecord {
  id: Id;
  classId: Id;
  startedAt: number;
  students: StudentRecord[];
  groups: GroupRecord[];
}

/** When students' data is cleared at the end of the school year. One document, id 'retention'. */
export interface RetentionSettings {
  id: 'retention';
  /** The last day of the school year, every year; null switches the yearly clearing off. */
  yearEnd: { month: number; day: number } | null;
  /** When `yearEnd` was last set: a clearing only happens at an end of year that comes well after this. */
  yearEndSetAt: number;
  /** When the last yearly clearing ran; null if never. */
  lastClearedAt: number | null;
}
