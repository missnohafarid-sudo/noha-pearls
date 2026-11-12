/** The single home for weeks and months on the school's clock: UTC+3 all year, weeks from Sunday, Gregorian months. */

export const SCHOOL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/** 0 is Sunday. */
const WEEK_START_DAY = 0;

export const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

export type PeriodKind = 'week' | 'month';

/** The kinds of period a person can choose between, in the order shown. */
export const PERIOD_KINDS: readonly PeriodKind[] = ['week', 'month'];

/** `start` is inclusive and `end` exclusive, in milliseconds. */
export interface Period {
  kind: PeriodKind;
  start: number;
  end: number;
}

/** A day of the calendar; `month` is 1 to 12. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** The school's wall clock as a date whose UTC getters read it. */
function onSchoolClock(at: number): Date {
  return new Date(at + SCHOOL_UTC_OFFSET_MS);
}

function schoolMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) - SCHOOL_UTC_OFFSET_MS;
}

export function periodAt(kind: PeriodKind, at: number): Period {
  const clock = onSchoolClock(at);
  const year = clock.getUTCFullYear();
  const month = clock.getUTCMonth();
  if (kind === 'month') return { kind, start: schoolMidnight(year, month, 1), end: schoolMidnight(year, month + 1, 1) };
  const daysSinceWeekStart = (clock.getUTCDay() - WEEK_START_DAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const start = schoolMidnight(year, month, clock.getUTCDate() - daysSinceWeekStart);
  return { kind, start, end: start + DAYS_PER_WEEK * DAY_MS };
}

/** The period `by` periods after this one (before it when negative). */
export function shiftPeriod(period: Period, by: number): Period {
  if (period.kind === 'week') {
    const start = period.start + by * DAYS_PER_WEEK * DAY_MS;
    return { kind: 'week', start, end: start + DAYS_PER_WEEK * DAY_MS };
  }
  const first = onSchoolClock(period.start);
  return periodAt('month', schoolMidnight(first.getUTCFullYear(), first.getUTCMonth() + by, 1));
}

export function inPeriod(period: Period, at: number): boolean {
  return at >= period.start && at < period.end;
}

/** The day of the calendar that holds this moment on the school's clock. */
export function dateOf(at: number): CalendarDate {
  const clock = onSchoolClock(at);
  return { year: clock.getUTCFullYear(), month: clock.getUTCMonth() + 1, day: clock.getUTCDate() };
}

/** The first and the last day of the period, for naming it. */
export function periodDates(period: Period): { first: CalendarDate; last: CalendarDate } {
  return { first: dateOf(period.start), last: dateOf(period.end - 1) };
}

/** How many days a month has; 29 February only in a leap year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A real day of the calendar: whole numbers, a month from 1 to 12 and a day the month has that year. */
export function isRealDate({ year, month, day }: CalendarDate): boolean {
  return [year, month, day].every(Number.isInteger) && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** The day, or the last day of its month when the month has fewer days that year. */
export function clampToMonth({ year, month, day }: CalendarDate): CalendarDate {
  return { year, month, day: Math.min(day, daysInMonth(year, month)) };
}

/** The first moment of the day, on the school's clock. */
export function startOfDay({ year, month, day }: CalendarDate): number {
  return schoolMidnight(year, month - 1, day);
}

/** The first moment of the day after: the end of this day, exclusive. */
export function startOfNextDay({ year, month, day }: CalendarDate): number {
  return schoolMidnight(year, month - 1, day + 1);
}
