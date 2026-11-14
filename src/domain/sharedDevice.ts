import { admittedDevices, seatGroupId } from './admission';
import { effectiveAnswer, isPerStudentChoice, type AnswerFrom } from './answering';
import { isPresent } from './attendance';
import type { Answer, AttendedRoster, Id, Participant, QuestionSlide } from './models';
import { membersOf } from './roster';

/**
 * The single home for what a shared group device may do for the students of its group: answer an individual choice
 * question for one of them. A student on a device of her own answers there; the shared device only helps the rest.
 */

export interface SharedMember {
  id: Id;
  name: string;
  /** False when an admitted device of her own holds her name: that device answers for her. */
  helped: boolean;
}

/**
 * The present students of the group a shared device sits in, in card order; none for a named seat. A student on an admitted
 * device of her own is listed but not helped. A seat still waiting to be let in holds nothing, and a seat that is gone holds nothing.
 */
export function sharedDeviceMembers(seat: Participant, roster: AttendedRoster, participants: readonly Participant[]): SharedMember[] {
  if (seat.studentId !== null) return [];
  const onOwnDevice = new Set(admittedDevices(participants).flatMap((other) => (other.studentId ? [other.studentId] : [])));
  return membersOf(seatGroupId(seat, roster.students), roster.students)
    .filter((student) => isPresent(roster, student.id))
    .sort((a, b) => a.cardNumber - b.cardNumber)
    .map(({ id, name }) => ({ id, name, helped: !onOwnDevice.has(id) }));
}

/** Whether this shared device may give an answer for this student: the one rule the service and the view both ask. */
export function mayAnswerFor(seat: Participant, studentId: Id, roster: AttendedRoster, participants: readonly Participant[]): boolean {
  return sharedDeviceMembers(seat, roster, participants).some((member) => member.id === studentId && member.helped);
}

export interface MemberAnswer {
  value: number | string;
  from: AnswerFrom;
}

export interface MemberView extends SharedMember {
  /** For a helped member: what counts for her on each individual choice question. Always empty for one on her own device. */
  answers: Record<Id, MemberAnswer>;
}

/** The members a shared device stands for, with the answers it is allowed to see: those of the students it answers for. */
export function memberViews(
  seat: Participant,
  roster: AttendedRoster,
  participants: readonly Participant[],
  answers: readonly Answer[],
  questions: readonly QuestionSlide[],
): MemberView[] {
  const choices = questions.filter(isPerStudentChoice);
  return sharedDeviceMembers(seat, roster, participants).map((member) => ({
    ...member,
    answers: Object.fromEntries(
      member.helped
        ? choices.flatMap((slide) => {
            const found = effectiveAnswer(roster, answers, slide, member.id);
            return found ? [[slide.id, { value: found.answer.value, from: found.from }] as const] : [];
          })
        : [],
    ),
  }));
}
