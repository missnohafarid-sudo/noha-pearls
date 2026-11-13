import { describe, expect, it } from 'vitest';
import type { Standings } from '../domain/standings';
import { StandingsCache } from './StandingsCache';

const sum = {} as Standings;

describe('the remembered standings', () => {
  it('computes once per key, again after a change to what they read, and not after an unrelated one', async () => {
    const cache = new StandingsCache();
    let computed = 0;
    const get = () => cache.get('c1|week|0', async () => (computed += 1, sum));
    await get();
    await get();
    expect(computed).toBe(1);
    cache.afterChange(['lessons', 'sessions']);
    await get();
    expect(computed).toBe(1);
    cache.afterChange(['rewards']);
    await get();
    expect(computed).toBe(2);
  });

  it('does not keep a failed sum', async () => {
    const cache = new StandingsCache();
    await expect(cache.get('k', () => Promise.reject(new Error('x')))).rejects.toThrow();
    await expect(cache.get('k', async () => sum)).resolves.toBe(sum);
  });

  it('computes every time when it is told not to remember', async () => {
    const cache = new StandingsCache(false);
    let computed = 0;
    for (let n = 0; n < 3; n += 1) await cache.get('k', async () => (computed += 1, sum));
    expect(computed).toBe(3);
  });
});
