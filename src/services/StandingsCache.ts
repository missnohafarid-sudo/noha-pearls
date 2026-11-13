import type { CollectionName } from '../ports/store';
import type { Standings } from '../domain/standings';

/** What the sums of a class list read: a change to any of these makes a remembered sum stale. */
const SOURCES: readonly CollectionName[] = ['records', 'rewards', 'groups', 'students', 'classes'];

/**
 * The cumulative results of a class list for one period, remembered between calls so that asking again costs nothing.
 * The hub, which lives longer than one command, owns one and tells it what each command changed.
 */
export class StandingsCache {
  private readonly sums = new Map<string, Promise<Standings>>();

  /** A cache that does not `remember` computes every time: for a place that cannot tell it what changed. */
  constructor(private readonly remembers = true) {}

  /** The remembered sum, or the one `compute` makes now; a sum that failed is not kept. */
  get(key: string, compute: () => Promise<Standings>): Promise<Standings> {
    if (!this.remembers) return compute();
    const known = this.sums.get(key);
    if (known) return known;
    const made = compute();
    this.sums.set(key, made);
    made.catch(() => this.sums.delete(key));
    return made;
  }

  /** Forgets every sum if a command changed something they read. */
  afterChange(changed: Iterable<CollectionName>): void {
    for (const collection of changed) {
      if (SOURCES.includes(collection)) return this.sums.clear();
    }
  }
}
