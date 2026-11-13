import { describe, expect, it } from 'vitest';
import {
  allowanceNearlyUsed,
  cardFits,
  commandAllowed,
  dayLevel,
  hasRoom,
  isHeldToLimits,
  isLockedAt,
  isOverLimit,
  socketAdmitted,
  utcDayOf,
  withCard,
  withEvent,
  withinWindow,
  type CardsSeen,
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

describe('the card budget of a socket', () => {
  const budget = { max: 2, windowMs: 1000 };

  it('lets a card already shown lately through for free, and a new one only while the budget has room', () => {
    let seen: CardsSeen = {};
    seen = withCard(seen, 7, 0, budget.windowMs);
    seen = withCard(seen, 8, 10, budget.windowMs);
    expect(cardFits(seen, 7, 20, budget)).toBe(true);
    expect(cardFits(seen, 9, 20, budget)).toBe(false);
  });

  it('gives the room back as the cards are forgotten', () => {
    const seen = withCard(withCard({}, 7, 0, 1000), 8, 600, 1000);
    expect(cardFits(seen, 9, 900, budget)).toBe(false);
    expect(cardFits(seen, 9, 1100, budget)).toBe(true);
    expect(cardFits(seen, 7, 1100, budget)).toBe(true);
    expect(withCard(seen, 9, 1100, 1000)).toEqual({ 8: 600, 9: 1100 });
  });
});

describe('the sockets the hub holds open', () => {
  const caps = { perDevice: 6, perAddress: 400, perHub: 3000 };

  it('admits one more only while every count is under its cap', () => {
    expect(socketAdmitted({ ofDevice: 5, ofAddress: 399, inHub: 2999 }, caps)).toBe(true);
    expect(socketAdmitted({ ofDevice: 6, ofAddress: 0, inHub: 0 }, caps)).toBe(false);
    expect(socketAdmitted({ ofDevice: 0, ofAddress: 400, inHub: 0 }, caps)).toBe(false);
    expect(socketAdmitted({ ofDevice: 0, ofAddress: 0, inHub: 3000 }, caps)).toBe(false);
  });
});

describe('a lock that runs until a moment', () => {
  it('holds before that moment and not at it, and an unknown lock holds nothing', () => {
    expect(isLockedAt(1000, 999)).toBe(true);
    expect(isLockedAt(1000, 1000)).toBe(false);
    expect(isLockedAt(undefined, 0)).toBe(false);
  });
});

describe('who the limits hold', () => {
  it('names the admin as the one caller no limit holds, and the day’s allowance asks it', () => {
    expect(isHeldToLimits(true)).toBe(false);
    expect(isHeldToLimits(false)).toBe(true);
    expect(commandAllowed('closed', true, 'ordinary')).toBe(true);
    expect(commandAllowed('closed', false, 'ordinary')).toBe(false);
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
