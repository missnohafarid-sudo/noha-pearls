import type { Answer, ClassRecord, Id, Participant, RetentionSettings, Reward, Session, SessionRoster } from './models';
import { clampToMonth, DAY_MS, dateOf, isRealDate, startOfDay, startOfNextDay, type CalendarDate } from './periods';
import { isLive } from './sessions';

/** The single home for what class data is cleared, and when: a range of dates, and the end of the school year. */

export type YearEnd = NonNullable<RetentionSettings['yearEnd']>;

/** Both days are included, on the school's clock. */
export interface DateRange {
  from: CalendarDate;
  to: CalendarDate;
}

/** A leap year, so that 29 February can be chosen as the last day of the year. */
export const LEAP_YEAR = 2000;

/** How many days before a clearing she is told, and the least time between setting the date and a clearing. */
export const NOTICE_DAYS = 7;
const NOTICE_MS = NOTICE_DAYS * DAY_MS;

/** How many years before this one a date to delete between can be chosen. */
export const RANGE_YEARS_BACK = 5;

/** The years the date pickers offer: from `RANGE_YEARS_BACK` years before this year, to this year. */
export function rangeYears(today: CalendarDate): { first: number; last: number } {
  return { first: today.year - RANGE_YEARS_BACK, last: today.year };
}

export function isValidRange({ from, to }: DateRange): boolean {
  return isRealDate(from) && isRealDate(to) && startOfDay(from) <= startOfDay(to);
}

/** The ended classes of one class list that started on a day of the range; a running class is never one of them. */
export function classesInRange(sessions: readonly Session[], classId: Id, range: DateRange): Session[] {
  if (!isValidRange(range)) return [];
  const first = startOfDay(range.from);
  const after = startOfNextDay(range.to);
  return sessions.filter((session) => session.classId === classId && !isLive(session) && session.startedAt >= first && session.startedAt < after);
}

/** The class a stored child of a class belongs to: answers, hearts and seats name it, a class record and a roll are named by it. */
export function ownerSessionId(child: Participant | Answer | Reward | ClassRecord | SessionRoster): Id {
  return 'sessionId' in child ? child.sessionId : child.id;
}

/** What a newly switched-on yearly clearing starts with: the end of June. */
export const DEFAULT_YEAR_END: YearEnd = { month: 6, day: 30 };

/** A month and a day that exist (29 February included). */
export function isValidYearEnd({ month, day }: YearEnd): boolean {
  return isRealDate({ year: LEAP_YEAR, month, day });
}

/** The moment the last day of the school year ends in a year: the day after begins. A day the month lacks that year is its last day. */
function yearEndsAt({ month, day }: YearEnd, year: number): number {
  return startOfNextDay(clampToMonth({ year, month, day }));
}

const isMoment = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * When the students' data is next cleared: the end of the last day of the school year, in the first year for which that moment
 * comes after the date was set plus the notice period, and after the last clearing. Null when the clearing is off or the settings are damaged.
 */
export function nextClearingAt(settings: RetentionSettings): number | null {
  const { yearEnd, yearEndSetAt, lastClearedAt } = settings;
  if (!yearEnd || !isValidYearEnd(yearEnd) || !isMoment(yearEndSetAt) || (lastClearedAt !== null && !isMoment(lastClearedAt))) return null;
  const after = Math.max(yearEndSetAt + NOTICE_MS, lastClearedAt ?? -Infinity);
  const year = dateOf(after).year;
  return [year, year + 1].map((candidate) => yearEndsAt(yearEnd, candidate)).find((at) => at > after) ?? null;
}

/** The last day of the school year that the next clearing follows. */
export function nextClearingDay(settings: RetentionSettings): CalendarDate | null {
  const at = nextClearingAt(settings);
  return at === null ? null : dateOf(at - 1);
}

export function isClearingDue(settings: RetentionSettings, now: number): boolean {
  const at = nextClearingAt(settings);
  return at !== null && now >= at;
}

/** The last day of the school year when the clearing comes within the notice period, so the interface can warn; null otherwise. */
export function clearingNotice(settings: RetentionSettings, now: number): CalendarDate | null {
  const at = nextClearingAt(settings);
  return at !== null && now < at && at - now <= NOTICE_MS ? nextClearingDay(settings) : null;
}

/** The day of the last clearing while it is at most the notice period old, so the interface can say it ran; null otherwise. */
export function recentClearingDay(settings: RetentionSettings, now: number): CalendarDate | null {
  const { lastClearedAt } = settings;
  return isMoment(lastClearedAt) && now - lastClearedAt <= NOTICE_MS ? dateOf(lastClearedAt) : null;
}

/** The settings of a school that never chose: the clearing is off. */
export function noRetention(now: number): RetentionSettings {
  return { id: 'retention', yearEnd: null, yearEndSetAt: now, lastClearedAt: null };
}

/** The settings with a new last day (or none); the next clearing counts from this moment. Nothing else changes. */
export function withYearEnd(settings: RetentionSettings, yearEnd: YearEnd | null, now: number): RetentionSettings {
  return { ...settings, yearEnd, yearEndSetAt: now };
}

/** When the hub looks for a due clearing next: at the due moment if it is within a day, otherwise in a day, so a change of settings is seen within a day. Never sooner than a second from now. */
export function nextCheckAt(dueAt: number | null, now: number): number {
  const daily = now + DAY_MS;
  return dueAt === null ? daily : Math.max(now + 1000, Math.min(dueAt, daily));
}

export function afterClearing(settings: RetentionSettings, now: number): RetentionSettings {
  return { ...settings, lastClearedAt: now };
}
