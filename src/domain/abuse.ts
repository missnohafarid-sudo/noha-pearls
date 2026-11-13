/** The single home of the counting rules that hold a device or an address to its share. Pure: the clock is passed in. */

export interface WindowLimit {
  readonly max: number;
  readonly windowMs: number;
}

/** How many events of one kind within a window make an offender, and how long the lock then lasts. */
export interface OffenceRule extends WindowLimit {
  readonly lockMs: number;
}

/** What a lock is kept against: a device at the door, a device's lookups, a network address's sign-in, the school's sign-in. */
export type LockKind = 'door' | 'lookups' | 'sign-in' | 'school-sign-in';

/** The one key a lock or a count is stored under. */
export const subjectOf = (kind: LockKind, key = ''): string => `${kind}:${key}`;

/** Whether a stored key is one of this kind's. */
export const isSubjectOf = (kind: LockKind, subject: string): boolean => subject.startsWith(`${kind}:`);

/** The moments of `times` that still count at `now`. */
export function withinWindow(times: readonly number[], now: number, windowMs: number): number[] {
  return times.filter((at) => at > now - windowMs && at <= now);
}

/** `times` with this moment added and the ones that no longer count dropped. */
export function withEvent(times: readonly number[], now: number, windowMs: number): number[] {
  return [...withinWindow(times, now, windowMs), now];
}

/** Whether the events in the window already number more than the limit allows. */
export function isOverLimit(times: readonly number[], now: number, { max, windowMs }: WindowLimit): boolean {
  return withinWindow(times, now, windowMs).length > max;
}

/** Whether one more event would still fit. */
export function hasRoom(times: readonly number[], now: number, { max, windowMs }: WindowLimit): boolean {
  return withinWindow(times, now, windowMs).length < max;
}

/** The most sockets the hub holds open for one device, one network address, and altogether. */
export interface SocketCaps {
  readonly perDevice: number;
  readonly perAddress: number;
  readonly perHub: number;
}

/** The most live reads one device may hold open, and all devices together. */
export interface WatchCaps {
  readonly perDevice: number;
  readonly perHub: number;
}

/** The sockets already open for a device, for its address, and altogether. */
export interface SocketCounts {
  readonly ofDevice: number;
  readonly ofAddress: number;
  readonly inHub: number;
}

/** Whether the limits of this module hold the caller: the admin is the one caller they never hold. */
export const isHeldToLimits = (isAdmin: boolean): boolean => !isAdmin;

/** What a caller's standing settles when a shared cap is full: the admin and a seated student keep their place, a visitor is refused. */
export type CapVerdict = 'admit' | 'refuse' | 'seated-only';

/**
 * The one rule for every cap on sockets and live reads. The admin is held to none. Everyone else is held to the device's own cap;
 * when that has room but a shared cap (the address's, the hub's) is full, only a seated student is let through, which the
 * caller works out (it costs a read, so it is asked only for this verdict).
 */
export function capVerdict(isAdmin: boolean, deviceHasRoom: boolean, sharedHaveRoom: boolean): CapVerdict {
  if (!isHeldToLimits(isAdmin)) return 'admit';
  if (!deviceHasRoom) return 'refuse';
  return sharedHaveRoom ? 'admit' : 'seated-only';
}

/** The verdict on one more socket of a device, given what is open. */
export function socketVerdict(open: SocketCounts, caps: SocketCaps, isAdmin: boolean): CapVerdict {
  return capVerdict(isAdmin, open.ofDevice < caps.perDevice, open.ofAddress < caps.perAddress && open.inHub < caps.perHub);
}

/** The verdict on one more live read of a device, given its own reads and the whole hub's. */
export function watchVerdict(open: { ofDevice: number; inHub: number }, caps: WatchCaps, isAdmin: boolean): CapVerdict {
  return capVerdict(isAdmin, open.ofDevice < caps.perDevice, open.inHub < caps.perHub);
}

/** Whether a lock that runs until `lockedUntil` still holds at `now`. */
export const isLockedAt = (lockedUntil: number | undefined, now: number): boolean => lockedUntil !== undefined && lockedUntil > now;

/** How far the day's allowance of writes has gone: 'answers-only' lets only the essential writes (answering, joining, leaving) through. */
export type DayLevel = 'open' | 'answers-only' | 'closed';

export interface DayThresholds {
  readonly answersOnlyAbove: number;
  readonly closedAbove: number;
}

export function dayLevel(rowsToday: number, { answersOnlyAbove, closedAbove }: DayThresholds): DayLevel {
  if (rowsToday > closedAbove) return 'closed';
  return rowsToday > answersOnlyAbove ? 'answers-only' : 'open';
}

/** What a call does, which is a property of the surface (`services/surfaceEffects.ts`): it only reads, it is a write the school cannot do without, or an ordinary write. */
export type CallEffect = 'read' | 'essential' | 'ordinary';

/** Whether a call may run at this level. The admin is never refused, nor is a read; above the first level only the essential writes run, above the second no write does. */
export function commandAllowed(level: DayLevel, isAdmin: boolean, effect: CallEffect): boolean {
  if (!isHeldToLimits(isAdmin) || effect === 'read' || level === 'open') return true;
  return level === 'answers-only' && effect === 'essential';
}

/** The UTC day a moment falls on, as a number of days. */
export const utcDayOf = (at: number): number => Math.floor(at / 86_400_000);

/** Whether the allowance is nearly used: what the teacher is told. */
export const allowanceNearlyUsed = (level: DayLevel): boolean => level !== 'open';
