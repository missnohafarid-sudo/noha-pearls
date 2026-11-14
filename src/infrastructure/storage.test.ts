import { describe, expect, it } from 'vitest';
import { browserStorage } from './storage';
import { StoredLook } from './StoredLook';

const blocked = (): Storage => {
  throw new Error('site data is blocked');
};

describe('the browser storage adapter', () => {
  it('does not reach for the browser`s storage until it is used, so a blocking browser cannot stop the page loading', () => {
    expect(() => browserStorage(blocked)).not.toThrow();
  });

  it('lets the look memory over blocked storage remember nothing and fail nowhere', () => {
    const look = new StoredLook(browserStorage(blocked), 'k');
    expect(() => look.remember('purple')).not.toThrow();
    expect(look.recall()).toBeNull();
  });

  it('reads and writes the storage it reaches', () => {
    const items = new Map<string, string>();
    const fake = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
      key: (index: number) => [...items.keys()][index] ?? null,
      get length() {
        return items.size;
      },
    } as unknown as Storage;
    const storage = browserStorage(() => fake);
    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
    expect(storage.keys()).toEqual(['a']);
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
  });
});
