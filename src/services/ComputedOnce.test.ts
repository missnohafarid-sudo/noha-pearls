import { describe, expect, it } from 'vitest';
import { ComputedOnce, NOT_REMEMBERED } from './ComputedOnce';

describe('what is computed once for everyone', () => {
  it('computes a key once and again after a change to a source it reads, not after an unrelated one', () => {
    const shared = new ComputedOnce({ maxEntries: 8, sources: ['lessons'] });
    let computed = 0;
    const ask = () => shared.get('catalogue', () => (computed += 1));
    expect([ask(), ask()]).toEqual([1, 1]);
    shared.afterChange(['sessions']);
    expect(ask()).toBe(1);
    shared.afterChange(['lessons']);
    expect(ask()).toBe(2);
  });

  it('never keeps more than its bound, forgetting the oldest first', () => {
    const shared = new ComputedOnce({ maxEntries: 3 });
    for (let n = 0; n < 50; n += 1) shared.get(`key-${n}`, () => n);
    let recomputed = 0;
    for (const key of ['key-47', 'key-48', 'key-49']) shared.get(key, () => (recomputed += 1));
    expect(recomputed).toBe(0);
    for (const key of ['key-0', 'key-46']) shared.get(key, () => (recomputed += 1));
    expect(recomputed).toBe(2);
  });

  it('does not keep a promise that failed', async () => {
    const shared = new ComputedOnce({ maxEntries: 3 });
    await expect(shared.get('k', () => Promise.reject(new Error('x')))).rejects.toThrow();
    await expect(shared.get('k', async () => 'again')).resolves.toBe('again');
  });

  it('computes every time when it does not remember', () => {
    let computed = 0;
    for (let n = 0; n < 3; n += 1) NOT_REMEMBERED.get('k', () => (computed += 1));
    expect(computed).toBe(3);
  });
});
