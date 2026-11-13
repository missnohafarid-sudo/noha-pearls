import { seatGroupId } from './admission';
import { isOnRoster } from './roster';
import { acceptsChanges } from './sessions';
import type { ClassRoster, Participant, Session, Student, SubjectRef } from './models';

/** Rules for giving hearts. */

/**
 * The teacher's heart goes to a student or a group on the session's roster, whether the class is running or has ended.
 * That the giver is the admin is the service's concern, not this rule's.
 */
export function canGiveTeacherHeart(session: Session | null, roster: ClassRoster, target: SubjectRef): boolean {
  return session !== null && isOnRoster(roster, target);
}

/**
 * Students encourage classmates in other groups, never their own group or themselves.
 * Only a named student can give one (not a shared group device), and only while the class is live.
 * Groups are the roster's now (`students`), so a moved student gives and receives by her new group.
 * That the giver's device was let in is the seat source's concern, not this rule's.
 */
export function canGivePeerHeart(session: Session, giver: Pick<Participant, 'groupId' | 'studentId'>, classmate: Student, students: readonly Student[]): boolean {
  return (
    acceptsChanges(session) &&
    giver.studentId !== null &&
    giver.studentId !== classmate.id &&
    seatGroupId(giver, students) !== classmate.groupId
  );
}

export function peerRewardTargets(session: Session, giver: Pick<Participant, 'groupId' | 'studentId'>, students: readonly Student[]): Student[] {
  return students.filter((student) => canGivePeerHeart(session, giver, student, students));
}
