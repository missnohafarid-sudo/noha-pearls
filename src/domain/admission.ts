import type { ClassRoster, Id, Participant, Session, Student } from './models';
import { groupById, membersOf, studentById } from './roster';
import { acceptsChanges, isLive } from './sessions';

/** The single home for who is let into a class: a device asks for a seat, the teacher lets it in. */

/** What a seat needs to know of a student to find her group; the roll and card numbers are not needed. */
type SeatStudent = Pick<Student, 'id' | 'groupId'>;

export function isAdmitted(participant: Participant): boolean {
  return participant.admitted;
}

/** Whether a device's seat is a place in the class: it was let in. A seat that is still waiting is none, and gives its device no more than a stranger has. */
export function holdsSeat(seat: Participant | null): seat is Participant {
  return seat !== null && isAdmitted(seat);
}

export function admittedDevices(participants: readonly Participant[]): Participant[] {
  return participants.filter(isAdmitted);
}

/** The devices still waiting to be let in, oldest request first. */
export function awaitingAdmission(participants: readonly Participant[]): Participant[] {
  return participants.filter((p) => !isAdmitted(p)).sort((a, b) => a.joinedAt - b.joinedAt);
}

/** The students whose names are held by a device other than `ownId`, waiting or admitted. */
export function namesHeldByOthers(participants: readonly Participant[], ownId: Id | null): Set<Id> {
  const held = new Set<Id>();
  for (const p of participants) if (p.id !== ownId && p.studentId !== null) held.add(p.studentId);
  return held;
}

/** The other devices that hold the name of `seat`, admitted or waiting; they leave when it is let in, so the name moves. */
export function seatsDisplacedBy(participants: readonly Participant[], seat: Participant): Participant[] {
  return seat.studentId === null ? [] : participants.filter((p) => p.id !== seat.id && p.studentId === seat.studentId);
}

export function isNameHeldElsewhere(participants: readonly Participant[], seat: Participant): boolean {
  return seatsDisplacedBy(participants, seat).length > 0;
}

const REQUEST_NUMBER_FIRST = 10;
const REQUEST_NUMBER_COUNT = 90;

/** A two-digit number that tells one seat's request apart from another's on the teacher's list and on the device. Not a secret. */
export function requestNumber(seat: Participant): number {
  let hash = 2166136261;
  for (const char of seat.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return REQUEST_NUMBER_FIRST + ((hash >>> 0) % REQUEST_NUMBER_COUNT);
}

/** The request number a waiting seat shows, only while another device holds or asks for its name; otherwise none. */
export function contestedRequestNumber(participants: readonly Participant[], seat: Participant): number | null {
  return !isAdmitted(seat) && isNameHeldElsewhere(participants, seat) ? requestNumber(seat) : null;
}

export type SeatLoss = 'removed' | 'name-taken';

/** Why a device lost its seat: a named seat that was only waiting lost its name to the device the teacher let in; any other seat was taken out. */
export function seatLoss(lost: Participant): SeatLoss {
  return !isAdmitted(lost) && lost.studentId !== null ? 'name-taken' : 'removed';
}

/**
 * A device may ask for a seat only in a live class, in a group of that class's roster. A named seat must be a student
 * of that group on the roster; a shared group device (`studentId` null) needs no name. A name another device holds may be asked for.
 */
export function canClaimSeat(session: Session | null, roster: ClassRoster, groupId: Id, studentId: Id | null): boolean {
  if (!acceptsChanges(session) || groupById(roster.groups, groupId) === null) return false;
  return studentId === null || studentById(roster.students, studentId)?.groupId === groupId;
}

/**
 * The group a seat sits in right now. A named seat follows her student, who may have been moved since she joined;
 * a shared group device keeps the group it joined.
 */
export function seatGroupId(seat: Pick<Participant, 'groupId' | 'studentId'>, students: readonly SeatStudent[]): Id {
  return studentById(students, seat.studentId)?.groupId ?? seat.groupId;
}

/** Who a seat answers for right now: her student (none for a shared device) in the group that student is in now. */
export function seatAnswerer(seat: Participant, students: readonly SeatStudent[]): { groupId: Id; studentId: Id | null } {
  return { groupId: seatGroupId(seat, students), studentId: seat.studentId };
}

/**
 * The students a seat puts on the roll when it is let in: her own name for a named seat; for a shared group device
 * every student of its group, since the group is here and its answer covers them. The teacher may mark any of them absent afterwards.
 */
export function studentsJoiningRoll(seat: Participant, students: readonly Student[]): Id[] {
  return seat.studentId ? [seat.studentId] : membersOf(seatGroupId(seat, students), students).map((student) => student.id);
}

/** Whether a page addressed to `groupId` is this seat's own: the group it joined, or the one her student is in now. */
export function isSeatOfGroupPage(seat: Participant, groupId: Id, students: readonly SeatStudent[]): boolean {
  return seat.groupId === groupId || seatGroupId(seat, students) === groupId;
}

/** The waiting seats one press may let in: every one except those whose name another device holds or asks for. */
export function seatsForBulkAdmission(participants: readonly Participant[]): Participant[] {
  return awaitingAdmission(participants).filter((seat) => !isNameHeldElsewhere(participants, seat));
}

/**
 * The seats a card may let in: what one "admit all" press would admit, restricted to the students whose cards
 * were seen. A card never moves a name; any seat whose name is held or asked for elsewhere needs the teacher's tap.
 */
export function seatsForCards(participants: readonly Participant[], studentIds: readonly Id[]): Participant[] {
  return seatsForBulkAdmission(participants).filter((p) => p.studentId !== null && studentIds.includes(p.studentId));
}

/** The waiting seats that only the teacher's tap can let in, because their name is held or asked for elsewhere. */
export function seatsNeedingTap(participants: readonly Participant[]): Participant[] {
  const bulk = new Set(seatsForBulkAdmission(participants).map((p) => p.id));
  return awaitingAdmission(participants).filter((p) => !bulk.has(p.id));
}

/**
 * The group page a device that comes back to a class belongs on: the group of the seat it still holds, waiting or let in,
 * or none when it holds no seat and must pick a group.
 */
export function returnGroupId(seat: Participant | null, students: readonly SeatStudent[]): Id | null {
  return seat && seatGroupId(seat, students);
}

type JoinLanding = { to: 'group'; groupId: Id } | { to: 'choose' } | { to: 'ended' };

/**
 * Where a device that types a class's code lands: on the group page of the seat it holds (an ended class shows her results there),
 * else on the group choices of a live class, else on the message that the class has ended.
 */
export function joinLanding(session: Session, seat: Participant | null, students: readonly SeatStudent[]): JoinLanding {
  const groupId = returnGroupId(seat, students);
  if (groupId) return { to: 'group', groupId };
  return isLive(session) ? { to: 'choose' } : { to: 'ended' };
}

/** The id of the seat a device holds (or asks for) in a session: one seat per device per class. */
export function seatId(sessionId: Id, deviceId: Id): Id {
  return `${sessionId}:${deviceId}`;
}

/** Whether asking for a seat again changes nothing: the device already holds a seat, waiting or let in, with the same group and name. */
export function joinChangesNothing(seat: Participant | null, groupId: Id, studentId: Id | null): boolean {
  return seat !== null && seat.groupId === groupId && seat.studentId === studentId;
}

export interface WaitingSeatLimits {
  perStudent: number;
  sharedPerClass: number;
}

/**
 * Whether a device may ask for a seat without crowding the class: other devices waiting under the same name number fewer than
 * `perStudent`, and for a shared group device the other shared devices waiting number fewer than `sharedPerClass`.
 * The device's own earlier seat is replaced by the new one, so it does not count.
 */
export function canWaitForSeat(participants: readonly Participant[], ownId: Id, studentId: Id | null, limits: WaitingSeatLimits): boolean {
  const others = awaitingAdmission(participants).filter((seat) => seat.id !== ownId);
  if (studentId !== null) return others.filter((seat) => seat.studentId === studentId).length < limits.perStudent;
  return others.filter((seat) => seat.studentId === null).length < limits.sharedPerClass;
}
