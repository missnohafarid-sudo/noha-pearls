import type { DayLevel } from '../domain/abuse';
import type { Unsubscribe } from './store';

/**
 * What the services ask of the transport about one connection's behaviour. Each answer is a plain yes or no; the services
 * turn a no into the error the page can show. The transport counts per device.
 */
export interface AbuseGuard {
  /** Whether this device may look a class code up (it is not locked out of lookups). */
  lookupAllowed(): boolean;
  /** A lookup of a code that named no class this caller may read. */
  recordMiss(): void;
  /** Counts one change of this device's seat (a join or a leave that writes) and says whether it fits its share. */
  seatChangeAllowed(): boolean;
}

/** Where the moments of a count are kept, by key: a `Map` in memory, a table when the count must outlive the hub's memory. */
export interface WindowMemory {
  get(key: string): readonly number[] | undefined;
  set(key: string, times: number[]): void;
  delete(key: string): void;
  keys(): Iterable<string>;
}

/** Where the locks are kept, by subject: in memory for those a device can shake off, in the database for those that must outlive the hub's sleep. */
export interface LockBook {
  /** When the subject's lock ends; undefined when it has none. */
  lockedUntil(subject: string): number | undefined;
  lock(subject: string, lockedUntil: number): void;
  release(subject: string): void;
  /** Forgets the locks that have ended. */
  prune(now: number): void;
}

/** How much of the day's write allowance is used, and a way to hear when that changes. */
export interface DayAllowance {
  level(): DayLevel;
  watch(listener: (level: DayLevel) => void): Unsubscribe;
}

export const NO_GUARD: AbuseGuard = { lookupAllowed: () => true, recordMiss: () => undefined, seatChangeAllowed: () => true };

export const NO_ALLOWANCE: DayAllowance = { level: () => 'open', watch: (listener) => (listener('open'), () => undefined) };
