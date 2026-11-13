import { seatId } from '../domain/admission';
import { codeOpens, lookupIsExempt } from '../domain/classCode';
import { normalizeJoinCode } from '../domain/ids';
import type { Participant, Session } from '../domain/models';
import type { AbuseGuard } from '../ports/abuse';
import type { Caller } from '../ports/caller';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { ClassResolver } from './ClassResolver';
import { requireWithin } from './LimitError';

/** Resolves class codes with the store, for the caller it was made for. */
export class ClassCodes implements ClassResolver {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly guard: AbuseGuard,
  ) {}

  async sessionOf(code: string): Promise<Session | null> {
    const [session] = await this.store.list('sessions', { code: normalizeJoinCode(code) });
    const seat = await this.store.get('participants', this.seatKey(session ?? null));
    return this.decide(session ?? null, seat, true);
  }

  /**
   * A lookup that finds nothing it may open, and one that finds nothing at all, do the same reads and give the same answer.
   * The first answer of a watch counts as the lookup; later changes (the class ending) are not lookups.
   */
  watchSession(code: string, listener: (session: Session | null) => void): Unsubscribe {
    const wanted = normalizeJoinCode(code);
    let stopSeat: Unsubscribe = () => undefined;
    let seatsOf: string | null = null;
    let first = true;
    let latest: Session | null = null;
    let seat: Participant | null = null;
    const emit = () => {
      const lookup = first;
      first = false;
      listener(this.decide(latest, seat, lookup));
    };
    const stopSession = this.store.watch('sessions', { code: wanted }, (sessions) => {
      latest = sessions[0] ?? null;
      const key = this.seatKey(latest);
      if (key === seatsOf) return emit();
      stopSeat();
      seatsOf = key;
      try {
        stopSeat = this.store.watch('participants', { id: key }, (docs) => {
          seat = docs[0] ?? null;
          emit();
        });
      } catch (error) {
        stopSeat = () => undefined;
        throw error;
      }
    });
    return () => {
      stopSession();
      stopSeat();
    };
  }

  private seatKey(session: Session | null): string {
    return seatId(session?.id ?? '', this.caller.deviceId());
  }

  private decide(session: Session | null, seat: Participant | null, isLookup: boolean): Session | null {
    const who = { isAdmin: this.caller.isAdmin(), seat };
    const exempt = lookupIsExempt(session, who);
    if (isLookup && !exempt) requireWithin(this.guard.lookupAllowed(), 'lookups');
    const opened = codeOpens(session, who) ? session : null;
    if (isLookup && !exempt && opened === null) this.guard.recordMiss();
    return opened;
  }
}
