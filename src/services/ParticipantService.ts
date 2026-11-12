import { canClaimSeat, isAdmitted } from '../domain/admission';
import { newId } from '../domain/ids';
import type { Id, Participant } from '../domain/models';
import { acceptsChanges } from '../domain/sessions';
import type { KeyValueStorage } from '../ports/storage';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { SeatSource } from './SeatSource';
import type { SessionRosterSource } from './SessionRosterSource';

/** This device's own seat in a session: asking for it, following it, giving it up. */
export class ParticipantService implements SeatSource {
  /**
   * @param deviceMemory survives reloads on this device, so a student who
   * refreshes the page keeps their name.
   * @param deviceKey where this device's identity is kept in that memory.
   */
  constructor(
    private readonly store: DocumentStore,
    private readonly deviceMemory: KeyValueStorage,
    private readonly deviceKey: string,
    private readonly rosters: SessionRosterSource,
  ) {}

  watchParticipants(sessionId: Id, listener: (participants: Participant[]) => void): Unsubscribe {
    return this.store.watch('participants', { sessionId }, listener);
  }

  /** This device's seat in the session, if it already joined. */
  watchMine(sessionId: Id, listener: (participant: Participant | null) => void): Unsubscribe {
    return this.store.watch('participants', { id: this.participantId(sessionId) }, (docs) => listener(docs[0] ?? null));
  }

  async admittedSeat(sessionId: Id): Promise<Participant | null> {
    const seat = await this.store.get('participants', this.participantId(sessionId));
    return seat && isAdmitted(seat) ? seat : null;
  }

  /**
   * Asks for a seat; the device waits until the teacher lets it in, even if it was in before. `studentId` null asks
   * as a shared group device. Returns null, storing nothing, unless the class is live and the group and student are
   * on the session's roster and belong together.
   */
  async join(sessionId: Id, groupId: Id, studentId: Id | null): Promise<Participant | null> {
    const [session, roster] = await Promise.all([this.store.get('sessions', sessionId), this.rosters.rosterOf(sessionId)]);
    if (!canClaimSeat(session, roster, groupId, studentId)) return null;
    const id = this.participantId(sessionId);
    const participant: Participant = { id, sessionId, groupId, studentId, joinedAt: Date.now(), admitted: false };
    await this.store.put('participants', participant);
    return participant;
  }

  /** Lets the device pick a different name; a class that has ended keeps its seats as they were. */
  async leave(sessionId: Id): Promise<void> {
    if (acceptsChanges(await this.store.get('sessions', sessionId))) await this.store.remove('participants', this.participantId(sessionId));
  }

  private participantId(sessionId: Id): Id {
    return `${sessionId}:${this.deviceId()}`;
  }

  private deviceId(): Id {
    const existing = this.deviceMemory.getItem(this.deviceKey);
    if (existing) return existing;
    const created = newId();
    this.deviceMemory.setItem(this.deviceKey, created);
    return created;
  }
}
