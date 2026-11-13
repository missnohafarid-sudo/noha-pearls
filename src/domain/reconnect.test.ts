import { describe, expect, it } from 'vitest';
import { retryDelay } from './reconnect';

const POLICY = { firstMs: 500, quickTries: 8, quickMaxMs: 15_000, slowMaxMs: 60_000, limitedMs: 60_000 };
const waits = (count: number, turnedAway = false, random = 1) => Array.from({ length: count }, (_, failures) => retryDelay(failures, turnedAway, random, POLICY));

describe('how long the page waits before it opens its socket again', () => {
  it('doubles from half a second to fifteen seconds for the first tries, then slows to a minute', () => {
    expect(waits(12)).toEqual([500, 1000, 2000, 4000, 8000, 15_000, 15_000, 15_000, 30_000, 60_000, 60_000, 60_000]);
  });

  it('spreads the pages out: between half and all of the wait, by the dice', () => {
    expect(retryDelay(3, false, 0, POLICY)).toBe(2000);
    expect(retryDelay(3, false, 0.5, POLICY)).toBe(3000);
    expect(retryDelay(3, false, 1, POLICY)).toBe(4000);
  });

  it('waits at least half a minute after the hub turned the page away, whatever the dice, and never more than a minute at the start', () => {
    expect(retryDelay(0, true, 0, POLICY)).toBe(30_000);
    expect(retryDelay(0, true, 1, POLICY)).toBe(60_000);
    expect(waits(3, true, 0).every((wait) => wait >= 30_000)).toBe(true);
  });

  it('keeps a long outage at a minute and does not overflow', () => {
    expect(retryDelay(5000, false, 1, POLICY)).toBe(60_000);
  });
});
