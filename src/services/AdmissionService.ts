import { isAdmitted, seatsDisplacedBy, seatsForBulkAdmission, seatsForCards, studentsJoiningRoll } from '../domain/admission';
import type { Id, Participant } from '../domain/models';
import { isOnRoster } from '../domain/roster';
import { acceptsChanges } from '../domain/sessions';
import type { DocumentStore } from '../ports/store';
import type { Caller } from '../ports/caller';
import { requireAdmin } from './AuthService';
import type { PresenceMarker } from './PresenceMarker';
import type { SessionRosterSource } from './SessionRosterSource';

/** The teacher's commands over who is inside the class. Every one is for the admin only. */
export class AdmissionService {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly rosters: SessionRosterSource,
    private readonly presence: PresenceMarker,
  ) {}

  /**
   * Lets in the device the teacher saw: `studentId` is the name her row showed, null for a shared device. Does nothing
   * unless the seat, as stored at that moment, is still waiting under that same name and she is on the session's roster.
   * Any other device holding the name leaves, so the name moves. A device let in puts on the roll
   * the students it answers for: its student, or for a shared device every student of its group.
   */
  async admit(participantId: Id, studentId: Id | null): Promise<void> {
    requireAdmin(this.caller);
    const seat = await this.letIn(participantId, studentId);
    if (seat) await this.putOnRoll(seat.sessionId, [seat]);
  }

  /**
   * The roll-call scan: puts the students whose cards were seen on the roll, whether or not they have a device, and lets in
   * the waiting devices among them. A card never moves a name: a seat whose name is held or asked for elsewhere waits for a tap.
   */
  async takeRoll(sessionId: Id, studentIds: readonly Id[]): Promise<void> {
    requireAdmin(this.caller);
    await this.presence.joinRoll(sessionId, studentIds);
    await this.letInSeats(seatsForCards(await this.store.list('participants', { sessionId }), studentIds));
  }

  /** Lets in every waiting device whose name no other device holds or asks for. */
  async admitAll(sessionId: Id): Promise<void> {
    requireAdmin(this.caller);
    await this.putOnRoll(sessionId, await this.letInSeats(seatsForBulkAdmission(await this.store.list('participants', { sessionId }))));
  }

  /** Sends a device out of the class and frees its name. */
  async remove(participantId: Id): Promise<void> {
    requireAdmin(this.caller);
    const seat = await this.store.get('participants', participantId);
    if (seat && acceptsChanges(await this.store.get('sessions', seat.sessionId))) await this.store.remove('participants', participantId);
  }

  /** Lets in each seat that is still waiting under its name; those that were let in. */
  private async letInSeats(seats: readonly Participant[]): Promise<Participant[]> {
    const letIn = await Promise.all(seats.map((seat) => this.letIn(seat.id, seat.studentId)));
    return letIn.filter((seat) => seat !== null);
  }

  private async putOnRoll(sessionId: Id, seats: readonly Participant[]): Promise<void> {
    const { students } = await this.rosters.rosterOf(sessionId);
    await this.presence.joinRoll(sessionId, seats.flatMap((seat) => studentsJoiningRoll(seat, students)));
  }

  /** The seat as it was when let in; null when the class has ended or the stored seat was no longer waiting under that name. */
  private async letIn(participantId: Id, studentId: Id | null): Promise<Participant | null> {
    const seen = await this.store.get('participants', participantId);
    if (!seen || !acceptsChanges(await this.store.get('sessions', seen.sessionId))) return null;
    if (studentId !== null && !isOnRoster(await this.rosters.rosterOf(seen.sessionId), { kind: 'student', id: studentId })) return null;
    const letIn: { seat: Participant | null } = { seat: null };
    await this.store.update('participants', participantId, (waiting) => {
      if (isAdmitted(waiting) || waiting.studentId !== studentId) return waiting;
      letIn.seat = waiting;
      return { ...waiting, admitted: true };
    });
    if (!letIn.seat) return null;
    const displaced = seatsDisplacedBy(await this.store.list('participants', { sessionId: letIn.seat.sessionId }), letIn.seat);
    await Promise.all(displaced.map((other) => this.store.remove('participants', other.id)));
    return letIn.seat;
  }
}
