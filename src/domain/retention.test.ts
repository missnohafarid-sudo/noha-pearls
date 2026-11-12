import { describe, expect, it } from 'vitest';
import type { ClassRecord, Participant, RetentionSettings, Session } from './models';
import { clampToMonth, daysInMonth, isRealDate, DAY_MS, SCHOOL_UTC_OFFSET_MS, startOfDay, startOfNextDay } from './periods';
import { afterClearing, classesInRange, clearingNotice, DEFAULT_YEAR_END, isClearingDue, isValidRange, isValidYearEnd, nextClearingAt, nextClearingDay, noRetention, NOTICE_DAYS, ownerSessionId, RANGE_YEARS_BACK, rangeYears, recentClearingDay, withYearEnd, type YearEnd } from './retention';

/** A moment given as school-clock (UTC+3) wall time. */
const qatar = (year: number, month: number, day: number, hour = 0, minute = 0) => Date.UTC(year, month - 1, day, hour, minute) - SCHOOL_UTC_OFFSET_MS;

const session = (startedAt: number, status: Session['status'] = 'ended'): Session => ({
  id: String(startedAt), code: 'c', lessonId: 'l', classId: 'k', className: 'k', teacherId: 't', teacherName: 't',
  status, slideIndex: 0, reveals: {}, pacing: {}, message: null, startedAt,
});

const settingsOf = (yearEnd: RetentionSettings['yearEnd'], yearEndSetAt: number, lastClearedAt: number | null = null): RetentionSettings => ({ id: 'retention', yearEnd, yearEndSetAt, lastClearedAt });

/** A school that set its end of year on this moment, after having chosen nothing before. */
const setOn = (yearEnd: YearEnd | null, at: number) => withYearEnd(noRetention(at), yearEnd, at);

describe('calendar days on the school clock', () => {
  it('knows month lengths, real dates and the edges of a day', () => {
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(isRealDate({ year: 2026, month: 2, day: 29 })).toBe(false);
    expect(isRealDate({ year: 2024, month: 2, day: 29 })).toBe(true);
    expect(isRealDate({ year: 2026, month: 13, day: 1 })).toBe(false);
    expect(isRealDate({ year: 2026, month: 1, day: 1.5 })).toBe(false);
    expect(clampToMonth({ year: 2026, month: 4, day: 31 })).toEqual({ year: 2026, month: 4, day: 30 });
    expect(startOfDay({ year: 2026, month: 3, day: 1 })).toBe(qatar(2026, 3, 1));
    expect(startOfNextDay({ year: 2026, month: 12, day: 31 })).toBe(qatar(2027, 1, 1));
  });
});

describe('a range of dates', () => {
  const range = { from: { year: 2026, month: 5, day: 10 }, to: { year: 2026, month: 5, day: 12 } };

  it('includes both days whole, on the school clock', () => {
    const inside = [qatar(2026, 5, 10, 0, 0), qatar(2026, 5, 12, 23, 59), qatar(2026, 5, 11, 12)];
    const outside = [qatar(2026, 5, 9, 23, 59), qatar(2026, 5, 13, 0, 0)];
    expect(classesInRange([...inside, ...outside].map((at) => session(at)), 'k', range).map((s) => s.startedAt).sort()).toEqual([...inside].sort());
  });

  it('counts a UTC instant of the previous day that is already the first day in Qatar', () => {
    const at = Date.UTC(2026, 4, 9, 22, 0);
    expect(classesInRange([session(at)], 'k', range)).toHaveLength(1);
  });

  it('never includes a running class', () => {
    expect(classesInRange([session(qatar(2026, 5, 11), 'live')], 'k', range)).toEqual([]);
  });

  it('is valid only for real dates in order', () => {
    expect(isValidRange(range)).toBe(true);
    expect(isValidRange({ from: range.to, to: range.from })).toBe(false);
    expect(isValidRange({ from: range.from, to: range.from })).toBe(true);
    expect(isValidRange({ from: { year: 2026, month: 2, day: 30 }, to: range.to })).toBe(false);
    expect(classesInRange([session(qatar(2026, 5, 11))], 'k', { from: range.to, to: range.from })).toEqual([]);
  });

  it('names only the classes of the class list asked for', () => {
    const at = qatar(2026, 5, 11);
    const other = { ...session(at + 1), id: 'other', classId: 'z' };
    expect(classesInRange([session(at), other], 'z', range).map((s) => s.id)).toEqual(['other']);
    expect(classesInRange([session(at), other], 'nobody', range)).toEqual([]);
  });

  it('offers the years from five back to this one', () => {
    expect(RANGE_YEARS_BACK).toBe(5);
    expect(rangeYears({ year: 2026, month: 11, day: 13 })).toEqual({ first: 2021, last: 2026 });
  });
});

describe('the end of the school year', () => {
  const june30 = { month: 6, day: 30 };

  it('rejects a day the month never has', () => {
    expect(isValidYearEnd({ month: 2, day: 29 })).toBe(true);
    expect(isValidYearEnd({ month: 4, day: 31 })).toBe(false);
    expect(isValidYearEnd({ month: 0, day: 1 })).toBe(false);
  });

  it('starts from the end of June', () => {
    expect(isValidYearEnd(DEFAULT_YEAR_END)).toBe(true);
  });

  it('fires next year when the day of this year has already passed', () => {
    const setAt = qatar(2026, 11, 13, 10);
    const settings = setOn(june30, setAt);
    expect(nextClearingAt(settings)).toBe(qatar(2027, 7, 1));
    expect(isClearingDue(settings, qatar(2026, 11, 14))).toBe(false);
    expect(nextClearingDay(settings)).toEqual({ year: 2027, month: 6, day: 30 });
  });

  it('fires this year when the day is still ahead, at the end of that day', () => {
    const settings = setOn({ month: 12, day: 31 }, qatar(2026, 11, 13));
    expect(nextClearingAt(settings)).toBe(qatar(2027, 1, 1));
    expect(isClearingDue(settings, qatar(2026, 12, 31, 23, 59))).toBe(false);
    expect(isClearingDue(settings, qatar(2027, 1, 1))).toBe(true);
  });

  it('is a year later after a clearing', () => {
    const first = setOn(june30, qatar(2026, 1, 1));
    const cleared = afterClearing(first, qatar(2026, 7, 2));
    expect(nextClearingAt(cleared)).toBe(qatar(2027, 7, 1));
    expect(isClearingDue(cleared, qatar(2026, 8, 1))).toBe(false);
  });

  it('counts from the moment of a change and keeps the last clearing', () => {
    const cleared = afterClearing(setOn(june30, qatar(2026, 1, 1)), qatar(2026, 7, 2));
    const changed = withYearEnd(cleared, { month: 8, day: 31 }, qatar(2026, 8, 15));
    expect(changed.lastClearedAt).toBe(cleared.lastClearedAt);
    expect(nextClearingAt(changed)).toBe(qatar(2026, 9, 1));
    const late = withYearEnd(cleared, { month: 8, day: 31 }, qatar(2026, 9, 5));
    expect(nextClearingAt(late)).toBe(qatar(2027, 9, 1));
  });

  it('takes 29 February as the last day of February in a common year', () => {
    const settings = setOn({ month: 2, day: 29 }, qatar(2026, 11, 13));
    expect(nextClearingAt(settings)).toBe(qatar(2027, 3, 1));
    expect(nextClearingDay(settings)).toEqual({ year: 2027, month: 2, day: 28 });
    expect(nextClearingAt(setOn({ month: 2, day: 29 }, qatar(2027, 11, 13)))).toBe(qatar(2028, 3, 1));
  });

  it('does not take 31 in a short month: such a day never reaches the settings', () => {
    expect(nextClearingAt(settingsOf({ month: 4, day: 31 }, qatar(2026, 1, 1)))).toBeNull();
  });

  it('never happens when it is off', () => {
    const off = setOn(null, qatar(2026, 1, 1));
    expect(nextClearingAt(off)).toBeNull();
    expect(nextClearingDay(off)).toBeNull();
    expect(isClearingDue(off, qatar(2090, 1, 1))).toBe(false);
    expect(clearingNotice(off, qatar(2026, 6, 28))).toBeNull();
  });

  it('warns only in the last seven days', () => {
    const settings = setOn(june30, qatar(2026, 1, 1));
    const at = qatar(2026, 7, 1);
    expect(clearingNotice(settings, at - NOTICE_DAYS * DAY_MS - 1)).toBeNull();
    expect(clearingNotice(settings, at - NOTICE_DAYS * DAY_MS)).toEqual({ year: 2026, month: 6, day: 30 });
    expect(clearingNotice(settings, at - 1)).toEqual({ year: 2026, month: 6, day: 30 });
    expect(clearingNotice(settings, at)).toBeNull();
  });

  it('never clears sooner than a full notice period after the date was set', () => {
    const lastDay = qatar(2026, 7, 1);
    expect(nextClearingAt(setOn(june30, qatar(2026, 6, 30, 12)))).toBe(qatar(2027, 7, 1));
    expect(nextClearingAt(setOn(june30, qatar(2026, 6, 24, 10)))).toBe(qatar(2027, 7, 1));
    expect(nextClearingAt(setOn(june30, qatar(2026, 6, 22, 10)))).toBe(lastDay);
  });

  it('never clears within the notice period after the date was set, whatever the day', () => {
    for (let hours = 0; hours < 24 * 400; hours += 5) {
      const setAt = qatar(2026, 1, 1) + hours * 3_600_000;
      const next = nextClearingAt(setOn(june30, setAt))!;
      expect(next).toBeGreaterThan(setAt + NOTICE_DAYS * DAY_MS);
    }
  });

  it('waits for the end of the day after a clearing even when it is late', () => {
    const late = settingsOf(june30, qatar(2026, 1, 1), qatar(2027, 7, 1, 5));
    expect(nextClearingAt(late)).toBe(qatar(2028, 7, 1));
  });

  it('is never due for damaged settings, and does not loop', () => {
    const damaged = [
      settingsOf({ month: 13, day: 1 }, qatar(2026, 1, 1)),
      settingsOf({ month: 2, day: 30 }, qatar(2026, 1, 1)),
      settingsOf({ month: Number.NaN, day: 1 }, qatar(2026, 1, 1)),
      settingsOf({ month: 6, day: 30.5 }, qatar(2026, 1, 1)),
      settingsOf(june30, Number.NaN),
      settingsOf(june30, Number.POSITIVE_INFINITY),
      settingsOf(june30, qatar(2026, 1, 1), Number.NaN),
      settingsOf(june30, qatar(2026, 1, 1), Number.NEGATIVE_INFINITY),
      { id: 'retention', yearEnd: june30, yearEndSetAt: qatar(2026, 1, 1) } as unknown as RetentionSettings,
      { id: 'retention', lastClearedAt: null, yearEndSetAt: qatar(2026, 1, 1) } as unknown as RetentionSettings,
      { id: 'retention', yearEnd: june30, lastClearedAt: null } as unknown as RetentionSettings,
      settingsOf(june30, 8.64e15),
    ];
    for (const settings of damaged) {
      expect(nextClearingAt(settings)).toBeNull();
      expect(nextClearingDay(settings)).toBeNull();
      expect(isClearingDue(settings, qatar(2090, 1, 1))).toBe(false);
      expect(clearingNotice(settings, qatar(2026, 6, 28))).toBeNull();
    }
  });

  it('tells the day of the last clearing for the notice period, and then not', () => {
    const cleared = afterClearing(setOn(june30, qatar(2026, 1, 1)), qatar(2026, 7, 2, 1));
    expect(recentClearingDay(cleared, qatar(2026, 7, 2, 2))).toEqual({ year: 2026, month: 7, day: 2 });
    expect(recentClearingDay(cleared, qatar(2026, 7, 2, 1) + NOTICE_DAYS * DAY_MS)).toEqual({ year: 2026, month: 7, day: 2 });
    expect(recentClearingDay(cleared, qatar(2026, 7, 2, 1) + NOTICE_DAYS * DAY_MS + 1)).toBeNull();
    expect(recentClearingDay(setOn(june30, qatar(2026, 1, 1)), qatar(2026, 7, 2))).toBeNull();
    expect(recentClearingDay(settingsOf(june30, 0, Number.NaN), 0)).toBeNull();
  });

  it('changes only the fields it names', () => {
    const cleared = afterClearing(setOn(june30, qatar(2026, 1, 1)), qatar(2026, 7, 2));
    expect(withYearEnd(cleared, null, 5)).toEqual({ id: 'retention', yearEnd: null, yearEndSetAt: 5, lastClearedAt: qatar(2026, 7, 2) });
    expect(afterClearing(cleared, 9)).toEqual({ ...cleared, lastClearedAt: 9 });
  });
});

describe('which class a stored child belongs to', () => {
  it('reads the class from answers, hearts and seats, and from the id of a record or a roll', () => {
    const seat = { id: 'p', sessionId: 's1', groupId: 'g', studentId: null, joinedAt: 0, admitted: true } satisfies Participant;
    const record = { id: 's2', classId: 'k', startedAt: 0, students: [], groups: [] } satisfies ClassRecord;
    expect(ownerSessionId(seat)).toBe('s1');
    expect(ownerSessionId(record)).toBe('s2');
  });
});
