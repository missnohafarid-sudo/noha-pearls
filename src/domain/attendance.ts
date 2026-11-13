import { admittedDevices, seatGroupId, seatsForCards } from './admission';
import type { AttendedRoster, Group, Id, Participant, Student } from './models';
import { membersOf, studentById } from './roster';

/**
 * The single home for who is here. Until a roll is taken everyone on the roster counts; once one is, only
 * the students in `present` do. Only students on the roster can be in it.
 */

export function rollTaken(roster: AttendedRoster): boolean {
  return roster.present !== null;
}

/** Whether the roll has this student in it. False while no roll was taken: use `isPresent` to know who counts. */
export function isOnRoll(roster: AttendedRoster, studentId: Id): boolean {
  return roster.present?.includes(studentId) ?? false;
}

export function isPresent(roster: AttendedRoster, studentId: Id): boolean {
  return !rollTaken(roster) || isOnRoll(roster, studentId);
}

export function presentStudents(roster: AttendedRoster): Student[] {
  return roster.students.filter((student) => isPresent(roster, student.id));
}

/** The groups with at least one present member. */
export function presentGroups(roster: AttendedRoster): Group[] {
  return roster.groups.filter((group) => membersOf(group.id, presentStudents(roster)).length > 0);
}

function known(roster: AttendedRoster, studentIds: readonly Id[]): Id[] {
  return studentIds.filter((id) => studentById(roster.students, id) !== null);
}

/** The roster with these students on the roll, starting one from an empty list when none was taken. The same roster when nobody is added: none of them is on the roster, or all are on the roll already. */
export function joinRoll<R extends AttendedRoster>(roster: R, studentIds: readonly Id[]): R {
  const ids = known(roster, studentIds);
  const newcomers = ids.filter((id) => !isOnRoll(roster, id));
  return ids.length === 0 || (rollTaken(roster) && newcomers.length === 0)
    ? roster
    : { ...roster, present: [...new Set([...(roster.present ?? []), ...ids])] };
}

/** The roster with these students added to a roll that exists; the same roster when none was taken or nobody is added. */
export function addToRoll<R extends AttendedRoster>(roster: R, studentIds: readonly Id[]): R {
  return rollTaken(roster) ? joinRoll(roster, studentIds) : roster;
}

/** The roster with her off the roll, starting one from everyone when none was taken; the same roster when she is off it already; null when she is not on the roster. */
export function markAbsent<R extends AttendedRoster>(roster: R, studentId: Id): R | null {
  if (studentById(roster.students, studentId) === null) return null;
  if (rollTaken(roster) && !isOnRoll(roster, studentId)) return roster;
  const base = roster.present ?? roster.students.map((student) => student.id);
  return { ...roster, present: base.filter((id) => id !== studentId) };
}

/** Whether seeing her answer card would change anything: she is not on the roll yet, or the card can let her waiting device in. */
export function sightingChangesAnything(roster: AttendedRoster, participants: readonly Participant[], studentId: Id): boolean {
  return !isOnRoll(roster, studentId) || seatsForCards(participants, [studentId]).length > 0;
}

/**
 * The groups a group question counts: those with a present member, those with a device let in (named or shared; a group
 * whose students the teacher then marked all absent still has its device), and those that have answered it already.
 */
export function countedGroups(roster: AttendedRoster, participants: readonly Participant[], answeredGroupIds: ReadonlySet<Id>): Group[] {
  const withPresentMember = new Set(presentGroups(roster).map((group) => group.id));
  const withDevice = new Set(admittedDevices(participants).map((seat) => seatGroupId(seat, roster.students)));
  return roster.groups.filter((group) => withPresentMember.has(group.id) || withDevice.has(group.id) || answeredGroupIds.has(group.id));
}
