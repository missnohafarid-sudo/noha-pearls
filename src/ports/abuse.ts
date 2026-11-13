import type { DayLevel } from '../domain/abuse';
import type { Unsubscribe } from './store';

/**
 * What the services ask of the transport about one connection's behaviour. Each answer is a plain yes or no; the services
 * turn a no into the error the page can show. The transport counts per socket, device and network address.
 */
export interface AbuseGuard {
  /** Whether this connection may look a class code up (it is not locked out, and the school's ceiling has not been reached). */
  lookupAllowed(): boolean;
  /** A lookup of a code that named no class this caller may read. */
  recordMiss(): void;
  /** Counts one `join` of this device and says whether it fits its share. */
  joinAllowed(): boolean;
  /** Counts a card number asked for on this socket and says whether it fits the budget. */
  cardAllowed(cardNumber: number): boolean;
}

/** How much of the day's write allowance is used, and a way to hear when that changes. */
export interface DayAllowance {
  level(): DayLevel;
  watch(listener: (level: DayLevel) => void): Unsubscribe;
}

export const NO_GUARD: AbuseGuard = { lookupAllowed: () => true, recordMiss: () => undefined, joinAllowed: () => true, cardAllowed: () => true };

export const NO_ALLOWANCE: DayAllowance = { level: () => 'open', watch: (listener) => (listener('open'), () => undefined) };
