import type { Id } from '../../domain/models';
import type { CollectionName, Unsubscribe } from '../../ports/store';

/** What a write touched: a collection, and for a packed one the class whose row changed. */
export interface Change {
  collection: CollectionName;
  owner?: Id;
}

interface Watcher {
  collection: CollectionName;
  /** The class the watcher is about, if it names one; it then ignores changes to other classes. */
  owner: Id | undefined;
  run(): void;
}

/** The standing queries: who is waiting for news of which collection. */
export class Watches {
  private readonly watchers = new Set<Watcher>();

  /** Registers `run` and calls it now with the current matches (the caller's job); returns the way to stop. */
  add(watcher: Watcher): Unsubscribe {
    this.watchers.add(watcher);
    return () => this.watchers.delete(watcher);
  }

  /** Runs each watcher at most once, and only the ones a change could concern. */
  notify(changes: readonly Change[]): void {
    for (const watcher of [...this.watchers]) {
      const concerned = changes.some((change) => change.collection === watcher.collection && (watcher.owner === undefined || change.owner === undefined || change.owner === watcher.owner));
      if (concerned && this.watchers.has(watcher)) watcher.run();
    }
  }
}
