import { newJoinCode } from './ids';
import { onlyOne } from './lists';
import type { Group, Id, Lesson, SchoolClass, Session, Teacher } from './models';

/** The single home for what state a class is in, and for which class an address or a page means. */

export function isLive(session: Session): boolean {
  return session.status === 'live';
}

function newestFirst(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((a, b) => b.startedAt - a.startedAt);
}

export function liveSessions(sessions: readonly Session[]): Session[] {
  return newestFirst(sessions).filter(isLive);
}

const RECENTLY_ENDED_LIMIT = 10;

/** The classes that ended most recently, newest first, so their results stay reachable. */
export function recentlyEnded(sessions: readonly Session[]): Session[] {
  return newestFirst(sessions)
    .filter((session) => !isLive(session))
    .slice(0, RECENTLY_ENDED_LIMIT);
}

/**
 * The class the monitor and the board show. The code in the address decides; without one:
 * the only live class, else the latest one when none is live (so results outlive the class),
 * else none (several are live: the visitor must choose).
 */
export function sessionForPage(sessions: readonly Session[], code: string | undefined): Session | null {
  if (code !== undefined) return sessions.find((session) => session.code === code) ?? null;
  const live = liveSessions(sessions);
  return live.length === 0 ? (newestFirst(sessions)[0] ?? null) : onlyOne(live);
}

/** The class the teacher's session page presents: the live one its code names. Without a code the page is the overview, so a second teacher can always reach it. */
export function liveSessionForPage(sessions: readonly Session[], code: string | undefined): Session | null {
  return code === undefined ? null : (liveSessions(sessions).find((session) => session.code === code) ?? null);
}

/** A join code that no stored class has, so a code always means one class. */
export function newUniqueJoinCode(sessions: readonly Session[], makeCode: () => string = newJoinCode): string {
  const taken = new Set(sessions.map((session) => session.code));
  let code = makeCode();
  while (taken.has(code)) code = makeCode();
  return code;
}

/** A class can start only when it has at least one group, so the room always has someone to join. */
export function hasGroupsToStart(groups: readonly Group[]): boolean {
  return groups.length > 0;
}

export type SessionBasis = Pick<Session, 'lessonId' | 'classId' | 'className' | 'teacherId' | 'teacherName'>;

/**
 * What a class starts from: a lesson, a class that has at least one group (`groups`) and a teacher, all stored,
 * with the names they have now; none otherwise, so the room always has someone to join.
 */
export function sessionBasis(
  lesson: Lesson | null,
  schoolClass: SchoolClass | null,
  teacher: Teacher | null,
  groups: readonly Group[],
): SessionBasis | null {
  if (!lesson || !schoolClass || !teacher || !hasGroupsToStart(groups)) return null;
  return { lessonId: lesson.id, classId: schoolClass.id, className: schoolClass.name, teacherId: teacher.id, teacherName: teacher.name };
}

/** An ended class is read-only: its state, seats, roster, roll and answers accept no change, so its results stay as they were. Students' hearts stop with it; the teacher's go on (`canGiveTeacherHeart`). */
export function acceptsChanges(session: Session | null): session is Session {
  return session !== null && isLive(session);
}

/** The code an address should take when it names no class: only a running class's, so a page opened before class follows the one that starts later. */
export function codeToFillIn(shown: Session | null, code: string | undefined): string | null {
  return code === undefined && shown !== null && isLive(shown) ? shown.code : null;
}

/** A class, a teacher or a lesson that a running class belongs to cannot be removed. */
export function canRemoveClass(classId: Id, sessions: readonly Session[]): boolean {
  return !sessions.some((session) => isLive(session) && session.classId === classId);
}

export function canRemoveTeacher(teacherId: Id, sessions: readonly Session[]): boolean {
  return !sessions.some((session) => isLive(session) && session.teacherId === teacherId);
}

export function canRemoveLesson(lessonId: Id, sessions: readonly Session[]): boolean {
  return !sessions.some((session) => isLive(session) && session.lessonId === lessonId);
}

/** The keys of a slide's hidden parts that the teacher has opened for this class. */
export function openedParts(session: Session, slideId: Id): readonly string[] {
  return session.hiddenOpen?.[slideId] ?? [];
}

/** The session with one hidden part of a slide opened or closed; doing either twice changes nothing more. */
export function withPartOpened(session: Session, slideId: Id, key: string, open: boolean): Session {
  const others = openedParts(session, slideId).filter((opened) => opened !== key);
  const parts = (open ? [...others, key] : others).sort();
  const { [slideId]: _, ...rest } = session.hiddenOpen ?? {};
  return { ...session, hiddenOpen: parts.length > 0 ? { ...rest, [slideId]: parts } : rest };
}
