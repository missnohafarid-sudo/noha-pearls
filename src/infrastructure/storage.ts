import type { KeyValueStorage } from '../ports/storage';

/** The browser's storage, reached only when it is used: a browser set to block site data throws on reaching it, and that must not stop the page from loading. */
export function browserStorage(reach: () => Storage): KeyValueStorage {
  return {
    getItem: (key) => reach().getItem(key),
    setItem: (key, value) => reach().setItem(key, value),
    removeItem: (key) => reach().removeItem(key),
    keys: () => {
      const storage = reach();
      return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null);
    },
  };
}

export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  keys(): string[] {
    return [...this.items.keys()];
  }
}
