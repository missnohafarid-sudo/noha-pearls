import { BoundedMap, deepFreeze } from '../../domain/structures';
import { isConcerned, type Change, type Subject } from './watches';

/**
 * What the store has read and keeps until a write could change it: each value is about a subject (a collection, maybe one class),
 * and is forgotten by the rule that decides which watches a write concerns (`isConcerned`). When full, the oldest goes, not all. A value is frozen when kept, so no reader can change what the next one is shown.
 */
export class Remembered<Value> {
  private readonly entries: BoundedMap<string, { subject: Subject; value: Value }>;

  constructor(capacity: number) {
    this.entries = new BoundedMap(capacity);
  }

  get(key: string): Value | undefined {
    return this.entries.get(key)?.value;
  }

  put(key: string, subject: Subject, value: Value): void {
    this.entries.set(key, { subject, value: deepFreeze(value) });
  }

  forget(changes: readonly Change[]): void {
    for (const [key, { subject }] of this.entries) if (changes.some((change) => isConcerned(subject, change))) this.entries.delete(key);
  }
}
