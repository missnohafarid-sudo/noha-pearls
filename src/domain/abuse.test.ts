import { describe, expect, it } from 'vitest';
import {
  allowanceNearlyUsed,
  capVerdict,
  commandAllowed,
  dayLevel,
  hasRoom,
  isHeldToLimits,
  isLockedAt,
  isOverLimit,
  isSubjectOf,
  socketVerdict,
  subjectOf,
  utcDayOf,
  watchVerdict,
  withEvent,
  withinWindow,
} from './abuse';

const LIMIT = { max: 3, windowMs: 1000 };
const DAY = { answersOnlyAbove: 80_000, closedAbove: 95_000 };

describe('counting events in a window', () => {
  it('counts only the events inside the window, and the window moves with the clock', () => {
    const times = [0, 400, 900];
    expect(withinWindow(times, 900, 1000)).toEqual([0, 400, 900]);
    expect(withinWindow(times, 1000, 1000)).toEqual([400, 900]);
    expect(withinWindow(times, 1400, 1000)).toEqual([900]);
    expect(withinWindow(times, 2000, 1000)).toEqual([]);
  });

  it('adds an event and forgets the ones that ran out', () => {
    expect(withEvent([0, 500], 1200, 1000)).toEqual([500, 1200]);
  });

  it('allows the limit and refuses one more: room until the count reaches the limit, over only above it', () => {
    let times: number[] = [];
    const states: boolean[][] = [];
    for (let n = 0; n < 5; n += 1) {
      times = withEvent(times, 10 + n, LIMIT.windowMs);
      states.push([hasRoom(times, 10 + n, LIMIT), isOverLimit(times, 10 + n, LIMIT)]);
    }
    expect(states).toEqual([[true, false], [true, false], [false, false], [false, true], [false, true]]);
  });

  it('has room again once the window has moved past the old events', () => {
    const times = [0, 1, 2, 3];
    expect(isOverLimit(times, 3, LIMIT)).toBe(true);
    expect(isOverLimit(times, 1001, LIMIT)).toBe(false);
    expect(hasRoom(times, 1003, LIMIT)).toBe(true);
  });
});

describe('what a lock or a count is kept against', () => {
  it('names a subject by its kind and key, and tells which kind a stored key belongs to', () => {
    expect(subjectOf('door', 'abc')).toBe('door:abc');
    expect(subjectOf('school-sign-in')).toBe('school-sign-in:');
    expect(isSubjectOf('door', 'door:abc')).toBe(true);
    expect(isSubjectOf('door', 'lookups:abc')).toBe(false);
    expect(isSubjectOf('sign-in', 'school-sign-in:')).toBe(false);
  });
});

describe('the caps on sockets and live reads', () => {
  const caps = { perDevice: 6, perAddress: 400, perHub: 3000 };

  it('names the admin as the one caller no limit holds, and every cap and the day’s allowance ask it', () => {
    expect(isHeldToLimits(true)).toBe(false);
    expect(isHeldToLimits(false)).toBe(true);
    expect(commandAllowed('closed', true, 'ordinary')).toBe(true);
    expect(commandAllowed('closed', false, 'ordinary')).toBe(false);
  });

  it('holds everyone but the admin to the device’s own cap', () => {
    expect(capVerdict(false, false, true)).toBe('refuse');
    expect(capVerdict(false, false, false)).toBe('refuse');
    expect(capVerdict(true, false, false)).toBe('admit');
  });

  it('lets through whoever has room, and leaves a full shared cap to a seated student: visitors are refused there, the admin never', () => {
    expect(capVerdict(false, true, true)).toBe('admit');
    expect(capVerdict(false, true, false)).toBe('seated-only');
    expect(capVerdict(true, true, false)).toBe('admit');
  });

  it('applies it to sockets by device, address and hub counts', () => {
    expect(socketVerdict({ ofDevice: 5, ofAddress: 399, inHub: 2999 }, caps, false)).toBe('admit');
    expect(socketVerdict({ ofDevice: 6, ofAddress: 0, inHub: 0 }, caps, false)).toBe('refuse');
    expect(socketVerdict({ ofDevice: 0, ofAddress: 400, inHub: 0 }, caps, false)).toBe('seated-only');
    expect(socketVerdict({ ofDevice: 0, ofAddress: 0, inHub: 3000 }, caps, false)).toBe('seated-only');
    expect(socketVerdict({ ofDevice: 6, ofAddress: 400, inHub: 3000 }, caps, true)).toBe('admit');
  });

  it('applies it to live reads by the device’s reads summed, and the hub’s', () => {
    const reads = { perDevice: 48, perHub: 20_000 };
    expect(watchVerdict({ ofDevice: 47, inHub: 19_999 }, reads, false)).toBe('admit');
    expect(watchVerdict({ ofDevice: 48, inHub: 0 }, reads, false)).toBe('refuse');
    expect(watchVerdict({ ofDevice: 0, inHub: 20_000 }, reads, false)).toBe('seated-only');
    expect(watchVerdict({ ofDevice: 48, inHub: 20_000 }, reads, true)).toBe('admit');
  });
});

describe('a lock that runs until a moment', () => {
  it('holds before that moment and not at it, and an unknown lock holds nothing', () => {
    expect(isLockedAt(1000, 999)).toBe(true);
    expect(isLockedAt(1000, 1000)).toBe(false);
    expect(isLockedAt(undefined, 0)).toBe(false);
  });
});

describe('how far the day’s allowance of writes has gone', () => {
  it('is open up to 80,000 rows, answers-only above that, and closed above 95,000', () => {
    expect(dayLevel(0, DAY)).toBe('open');
    expect(dayLevel(80_000, DAY)).toBe('open');
    expect(dayLevel(80_001, DAY)).toBe('answers-only');
    expect(dayLevel(95_000, DAY)).toBe('answers-only');
    expect(dayLevel(95_001, DAY)).toBe('closed');
  });

  it('refuses a student’s write by level, lets the essential ones through until closed, never refuses a read, and never refuses the teacher', () => {
    expect(commandAllowed('open', false, 'ordinary')).toBe(true);
    expect(commandAllowed('answers-only', false, 'ordinary')).toBe(false);
    expect(commandAllowed('answers-only', false, 'essential')).toBe(true);
    expect(commandAllowed('closed', false, 'essential')).toBe(false);
    expect(commandAllowed('closed', false, 'ordinary')).toBe(false);
    for (const level of ['open', 'answers-only', 'closed'] as const) {
      expect(commandAllowed(level, false, 'read')).toBe(true);
      for (const effect of ['read', 'essential', 'ordinary'] as const) expect(commandAllowed(level, true, effect)).toBe(true);
    }
  });

  it('tells the teacher once it is nearly used', () => {
    expect(allowanceNearlyUsed('open')).toBe(false);
    expect(allowanceNearlyUsed('answers-only')).toBe(true);
    expect(allowanceNearlyUsed('closed')).toBe(true);
  });

  it('counts by UTC day, which rolls over at midnight UTC', () => {
    const midnight = Date.UTC(2026, 10, 14);
    expect(utcDayOf(midnight - 1)).toBe(utcDayOf(midnight) - 1);
    expect(utcDayOf(midnight)).toBe(utcDayOf(midnight + 86_399_999));
    expect(utcDayOf(midnight + 86_400_000)).toBe(utcDayOf(midnight) + 1);
  });
});
