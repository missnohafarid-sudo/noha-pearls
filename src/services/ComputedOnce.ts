import type { CollectionName } from '../ports/store';

export interface ComputedOnceOptions {
  /** How many values it keeps; past that the oldest is forgotten. */
  maxEntries: number;
  /** The collections whose change makes every kept value stale (`afterChange`). */
  sources?: readonly CollectionName[];
  /** False for a place that cannot tell it what changed: it then computes every time. */
  remembers?: boolean;
}

/**
 * What everyone who asks the same question is shown alike, computed once and shared until the store changes, instead of once per asker.
 * Only what does not depend on who asks belongs here. A promise that fails is not kept.
 */
export class ComputedOnce {
  private readonly values = new Map<string, unknown>();
  private readonly maxEntries: number;
  private readonly sources: readonly CollectionName[];
  private readonly remembers: boolean;

  constructor({ maxEntries, sources = [], remembers = true }: ComputedOnceOptions) {
    this.maxEntries = maxEntries;
    this.sources = sources;
    this.remembers = remembers;
  }

  get<T>(key: string, compute: () => T): T {
    if (!this.remembers) return compute();
    if (this.values.has(key)) return this.values.get(key) as T;
    const made = compute();
    if (this.values.size >= this.maxEntries) this.values.delete(this.values.keys().next().value as string);
    this.values.set(key, made);
    if (made instanceof Promise) made.catch(() => this.forgetIfStill(key, made));
    return made;
  }

  /** Forgets every value if a command changed something they read. */
  afterChange(changed: Iterable<CollectionName>): void {
    for (const collection of changed) {
      if (this.sources.includes(collection)) return this.values.clear();
    }
  }

  private forgetIfStill(key: string, made: unknown): void {
    if (this.values.get(key) === made) this.values.delete(key);
  }
}

/** Computes every time: what a lone page, which nothing tells of changes, uses. */
export const NOT_REMEMBERED = new ComputedOnce({ maxEntries: 0, remembers: false });
