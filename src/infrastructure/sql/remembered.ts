import { isConcerned, type Change, type Subject } from './watches';

/**
 * What the store has read and keeps until a write could change it: each value is about a subject (a collection, maybe one class),
 * and is forgotten by the rule that decides which watches a write concerns (`isConcerned`). When full, the oldest goes, not all.
 */
export class Remembered<Value> {
  private readonly entries = new Map<string, { subject: Subject; value: Value }>();

  constructor(private readonly capacity: number) {}

  get(key: string): Value | undefined {
    return this.entries.get(key)?.value;
  }

  put(key: string, subject: Subject, value: Value): void {
    this.entries.delete(key);
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(key, { subject, value });
  }

  forget(changes: readonly Change[]): void {
    for (const [key, { subject }] of this.entries) if (changes.some((change) => isConcerned(subject, change))) this.entries.delete(key);
  }
}
