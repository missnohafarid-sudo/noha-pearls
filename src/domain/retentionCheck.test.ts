import { describe, expect, it } from 'vitest';
import { DAY_MS } from './periods';
import { nextCheckAt } from './retention';

describe('when the hub looks for a due clearing next', () => {
  const now = 1_000_000;

  it('looks again in a day when nothing is set, or the clearing is further off than that', () => {
    expect(nextCheckAt(null, now)).toBe(now + DAY_MS);
    expect(nextCheckAt(now + 400 * DAY_MS, now)).toBe(now + DAY_MS);
  });

  it('looks at the due moment when it is within a day', () => {
    expect(nextCheckAt(now + 3_600_000, now)).toBe(now + 3_600_000);
  });

  it('never looks sooner than a second from now, even for a moment that has passed', () => {
    expect(nextCheckAt(now - 5, now)).toBe(now + 1000);
    expect(nextCheckAt(now, now)).toBe(now + 1000);
  });
});
