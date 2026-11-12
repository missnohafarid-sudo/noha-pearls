import type { KeyValueStorage } from '../ports/storage';

export function browserStorage(storage: Storage): KeyValueStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys: () => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null),
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
