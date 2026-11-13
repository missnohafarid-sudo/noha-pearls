import { MAX_COMPUTED_ENTRIES } from '../ports/limits';
import type { CollectionName } from '../ports/store';
import { ComputedOnce } from './ComputedOnce';

/** What the sums of a class list read: a change to any of these makes a remembered sum stale. */
const SOURCES: readonly CollectionName[] = ['records', 'rewards', 'groups', 'students', 'classes'];

/**
 * The cumulative results of a class list for one period, remembered between calls so that asking again costs nothing.
 * The hub, which lives longer than one command, owns one and tells it what each command changed.
 */
export class StandingsCache extends ComputedOnce {
  constructor() {
    super({ maxEntries: MAX_COMPUTED_ENTRIES, sources: SOURCES });
  }
}
