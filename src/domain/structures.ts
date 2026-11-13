/** Small pure data structures that several layers share. */

/** A map that keeps at most `capacity` entries: when it is full, the oldest goes (not all). Setting a key again makes it the newest. */
export class BoundedMap<Key, Value> implements Iterable<[Key, Value]> {
  private readonly entries = new Map<Key, Value>();

  constructor(private readonly capacity: number) {}

  get(key: Key): Value | undefined {
    return this.entries.get(key);
  }

  has(key: Key): boolean {
    return this.entries.has(key);
  }

  set(key: Key, value: Value): void {
    this.entries.delete(key);
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value as Key);
    this.entries.set(key, value);
  }

  delete(key: Key): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  [Symbol.iterator](): Iterator<[Key, Value]> {
    return this.entries[Symbol.iterator]();
  }
}

/** The value and everything inside it made unchangeable, so that whoever holds it cannot alter what others will be shown. Returns the value itself. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
