import { describe, expect, it } from 'vitest';
import { BoundedMap, deepFreeze } from './structures';

describe('BoundedMap', () => {
  it('drops the oldest entry when full, and a key set again becomes the newest', () => {
    const map = new BoundedMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 3);
    map.set('c', 4);
    expect([...map]).toEqual([
      ['a', 3],
      ['c', 4],
    ]);
    expect(map.has('b')).toBe(false);
  });

  it('forgets one entry or all', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.delete('a');
    expect(map.get('a')).toBeUndefined();
    map.clear();
    expect([...map]).toEqual([]);
  });
});

describe('deepFreeze', () => {
  it('makes a value and everything inside it unchangeable', () => {
    const doc = deepFreeze({ id: 'x', tags: ['a'], inner: { n: 1 } });
    expect(() => {
      doc.inner.n = 2;
    }).toThrow(TypeError);
    expect(() => doc.tags.push('b')).toThrow(TypeError);
    expect(doc.inner.n).toBe(1);
  });
});
