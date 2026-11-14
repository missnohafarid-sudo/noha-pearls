import type { LookMemory } from '../ports/lookMemory';
import type { KeyValueStorage } from '../ports/storage';

/** The look this device showed last, kept in browser storage; a browser that refuses storage simply remembers nothing. */
export class StoredLook implements LookMemory {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string,
  ) {}

  recall(): string | null {
    try {
      return this.storage.getItem(this.key);
    } catch {
      return null;
    }
  }

  remember(look: string): void {
    try {
      this.storage.setItem(this.key, look);
    } catch {
      return;
    }
  }
}
