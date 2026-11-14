import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../ports/storage';
import { MemoryStorage } from './storage';
import { StoredLook } from './StoredLook';

describe('the look this device remembers', () => {
  it('is nothing at first, then the last look remembered', () => {
    const look = new StoredLook(new MemoryStorage(), 'k');
    expect(look.recall()).toBeNull();
    look.remember('purple');
    look.remember('black');
    expect(look.recall()).toBe('black');
  });

  it('survives a new page over the same storage', () => {
    const storage = new MemoryStorage();
    new StoredLook(storage, 'k').remember('purple');
    expect(new StoredLook(storage, 'k').recall()).toBe('purple');
  });

  it('is nothing, and does not fail, when the browser refuses storage', () => {
    const refusing: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => undefined,
      keys: () => [],
    };
    const look = new StoredLook(refusing, 'k');
    expect(() => look.remember('purple')).not.toThrow();
    expect(look.recall()).toBeNull();
  });
});
