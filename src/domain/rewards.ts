import { seatGroupId } from './admission';
import { isOnRoster } from './roster';
import { acceptsChanges } from './sessions';
import type { ClassRoster, Participant, Reward, RewardEffect, Session, Student, SubjectRef } from './models';

/** Rules for giving and taking hearts. */

/**
 * The teacher's heart goes to a student or a group on the session's roster, whether the class is running or has ended.
 * That the giver is the admin is the service's concern, not this rule's.
 */
export function canGiveTeacherHeart(session: Session | null, roster: ClassRoster, target: SubjectRef): boolean {
  return session !== null && isOnRoster(roster, target);
}

/** What the teacher's heart press does for a target, given its OWN tally's `taken`: gives back a taken heart first, else adds a plain one (undefined). */
export function teacherHeartEffect(taken: number): RewardEffect | undefined {
  return taken > 0 ? 'returned' : undefined;
}

/** A heart can be taken from a target only while the count shown for it is above zero. */
export function hasHeartToTake(shownTotal: number): boolean {
  return shownTotal > 0;
}

/** The teacher takes a heart from whom she could give one, and only while the count shown for the target has one. */
export function canTakeTeacherHeart(session: Session | null, roster: ClassRoster, target: SubjectRef, shownTotal: number): boolean {
  return canGiveTeacherHeart(session, roster, target) && hasHeartToTake(shownTotal);
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

/** A student may give only so many hearts in one class; the teacher's are not counted. `given` are the hearts she has given there. */
export function canGiveAnotherPeerHeart(given: readonly Pick<Reward, 'source'>[], limit: number): boolean {
  return given.filter((heart) => heart.source === 'peer').length < limit;
}
