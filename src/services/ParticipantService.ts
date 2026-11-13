import { canClaimSeat, canWaitForSeat, isAdmitted, seatId } from '../domain/admission';
import type { Id, Participant } from '../domain/models';
import { acceptsChanges } from '../domain/sessions';
import { nameClaims, readerOf, type NameClaims, type Reader } from '../domain/visibility';
import { WAITING_SEATS_PER_STUDENT, WAITING_SHARED_SEATS_PER_CLASS } from '../ports/limits';
import type { AbuseGuard } from '../ports/abuse';
import type { Caller } from '../ports/caller';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { combineWatches } from './combineWatches';
import { watchByCode } from './classData';
import type { ClassResolver } from './ClassResolver';
import { requireWithin } from './LimitError';
import type { ReaderSource } from './ReaderSource';
import type { SeatSource } from './SeatSource';
import type { SessionRosterSource } from './SessionRosterSource';
import { adminWatch } from './AuthService';

const NO_CLAIMS: NameClaims = { heldByOthers: [], requestNumber: null };

/** This device's own seat in a session: asking for it, following it, giving it up. */
export class ParticipantService implements SeatSource, ReaderSource {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly rosters: SessionRosterSource,
    private readonly codes: ClassResolver,
    private readonly guard: AbuseGuard,
  ) {}

  /** Every seat of the class, with the devices behind them. The teacher's only. */
  watchParticipants(sessionId: Id, listener: (participants: Participant[]) => void): Unsubscribe {
    return adminWatch(this.caller, listener, (emit) => this.store.watch('participants', { sessionId }, emit));
  }

  /** Which names other devices hold and the request number of this device's own seat, in the class this code opens for it: no seat of another device is revealed. */
  watchNameClaims(code: string, listener: (claims: NameClaims) => void): Unsubscribe {
    const claimsIn = (sessionId: Id) => (emit: (claims: NameClaims) => void) =>
      combineWatches<[Participant[], Participant | null]>(
        [(next) => this.store.watch('participants', { sessionId }, next), (next) => this.watchMine(sessionId, next)],
        (everyone, mine) => emit(nameClaims(everyone, mine)),
      );
    return watchByCode(this.codes, code, (session) => claimsIn(session.id), NO_CLAIMS, listener);
  }

  /** This device's seat in the session, if it already joined. */
  watchMine(sessionId: Id, listener: (participant: Participant | null) => void): Unsubscribe {
    return this.store.watch('participants', { id: this.participantId(sessionId) }, (docs) => listener(docs[0] ?? null));
  }

  /** Who this caller reads as: the admin or not, and the let-in seat it holds. Asked of the caller at each emission. */
  watchReader(sessionId: Id, listener: (reader: Reader) => void): Unsubscribe {
    return this.watchMine(sessionId, (seat) => listener(readerOf(this.caller.isAdmin(), seat)));
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
  async join(code: string, groupId: Id, studentId: Id | null): Promise<Participant | null> {
    const opened = await this.codes.sessionOf(code);
    if (!opened) return null;
    const sessionId = opened.id;
    requireWithin(this.guard.joinAllowed(), 'joins');
    const [session, roster, seats] = await Promise.all([this.store.get('sessions', sessionId), this.rosters.rosterOf(sessionId), this.store.list('participants', { sessionId })]);
    if (!canClaimSeat(session, roster, groupId, studentId)) return null;
    const id = this.participantId(sessionId);
    requireWithin(canWaitForSeat(seats, id, studentId, { perStudent: WAITING_SEATS_PER_STUDENT, sharedPerClass: WAITING_SHARED_SEATS_PER_CLASS }), 'seats-full');
    const participant: Participant = { id, sessionId, groupId, studentId, joinedAt: Date.now(), admitted: false };
    await this.store.put('participants', participant);
    return participant;
  }

  /** Lets the device pick a different name; a class that has ended keeps its seats as they were. */
  async leave(sessionId: Id): Promise<void> {
    if (acceptsChanges(await this.store.get('sessions', sessionId))) await this.store.remove('participants', this.participantId(sessionId));
  }

  private participantId(sessionId: Id): Id {
    return seatId(sessionId, this.caller.deviceId());
  }
}
