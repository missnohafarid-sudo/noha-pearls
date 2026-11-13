/** The single home of the counting rules that hold a device or an address to its share. Pure: the clock is passed in. */

export interface WindowLimit {
  readonly max: number;
  readonly windowMs: number;
}

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

/** The card numbers shown lately, with the moment each was last shown. */
export type CardsSeen = Readonly<Record<number, number>>;

/** Whether this card number may be asked for: one already shown lately is free, a new one needs room in the budget. */
export function cardFits(seen: CardsSeen, card: number, now: number, { max, windowMs }: WindowLimit): boolean {
  const lately = cardsSeenNow(seen, now, windowMs);
  return lately[card] !== undefined || Object.keys(lately).length < max;
}

export function cardsSeenNow(seen: CardsSeen, now: number, windowMs: number): CardsSeen {
  return Object.fromEntries(Object.entries(seen).filter(([, at]) => at > now - windowMs));
}

export function withCard(seen: CardsSeen, card: number, now: number, windowMs: number): CardsSeen {
  return { ...cardsSeenNow(seen, now, windowMs), [card]: now };
}

/** The most sockets the hub holds open for one device, one network address, and altogether. */
export interface SocketCaps {
  readonly perDevice: number;
  readonly perAddress: number;
  readonly perHub: number;
}

/** The sockets already open for a device, for its address, and altogether. */
export interface SocketCounts {
  readonly ofDevice: number;
  readonly ofAddress: number;
  readonly inHub: number;
}

/** Whether one more socket of this device and address fits under every cap. */
export function socketAdmitted(open: SocketCounts, caps: SocketCaps): boolean {
  return open.ofDevice < caps.perDevice && open.ofAddress < caps.perAddress && open.inHub < caps.perHub;
}

/** Whether the limits of this module hold the caller: the admin is the one caller they never hold. */
export const isHeldToLimits = (isAdmin: boolean): boolean => !isAdmin;

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
