import { describe, expect, it } from 'vitest';
import { KeyedWindows } from './KeyedWindows';

const LIMIT = { max: 2, windowMs: 1000 };

describe('KeyedWindows', () => {
  it('counts per key, and the room comes back as the window moves on', () => {
    const clock = { now: 10_000 };
    const windows = new KeyedWindows(LIMIT, () => clock.now);
    windows.record('a');
    windows.record('a');
    expect(windows.hasRoom('a')).toBe(false);
    expect(windows.hasRoom('b')).toBe(true);
    clock.now += LIMIT.windowMs;
    expect(windows.hasRoom('a')).toBe(true);
  });

  it('forgets the keys with nothing left in the window, and keeps the others', () => {
    const clock = { now: 10_000 };
    const memory = new Map<string, number[]>();
    const windows = new KeyedWindows(LIMIT, () => clock.now, memory);
    for (let n = 0; n < 50; n += 1) windows.record(`10.0.0.${n}`);
    windows.prune();
    expect(memory.size).toBe(50);
    clock.now += LIMIT.windowMs / 2;
    windows.record('recent');
    clock.now += LIMIT.windowMs / 2;
    windows.prune();
    expect([...memory.keys()]).toEqual(['recent']);
  });
});
