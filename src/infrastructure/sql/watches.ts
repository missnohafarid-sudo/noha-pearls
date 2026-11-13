import type { Id } from '../../domain/models';
import type { CollectionName, Unsubscribe } from '../../ports/store';

/** What a write touched: a collection, and for a packed one the class whose row changed. */
export interface Change {
  collection: CollectionName;
  owner?: Id;
}

/** What a standing query or a remembered result is about: a collection, and for a packed one maybe a single class. */
export interface Subject {
  collection: CollectionName;
  /** The class it is about, if it names one; it then ignores changes to other classes. */
  owner: Id | undefined;
}

/** Whether a change could alter what the subject reads. */
export function isConcerned(subject: Subject, change: Change): boolean {
  return change.collection === subject.collection && (subject.owner === undefined || change.owner === undefined || change.owner === subject.owner);
}

interface Watcher extends Subject {
  run(): void;
  /** Told why the watcher was dropped, when running it failed. */
  dropped?: (error: unknown) => void;
}

/** The standing queries: who is waiting for news of which collection. */
export class Watches {
  private readonly watchers = new Set<Watcher>();

  constructor(private readonly report: (error: unknown) => void) {}

  /** Registers `run` and calls it now with the current matches (the caller's job); returns the way to stop. */
  add(watcher: Watcher): Unsubscribe {
    this.watchers.add(watcher);
    return () => this.watchers.delete(watcher);
  }

  /**
   * Runs each watcher at most once, and only the ones a change could concern. A watcher that fails is dropped and the failure
   * reported; it never stops the others, and never reaches the one who made the change.
   */
  notify(changes: readonly Change[]): void {
    for (const watcher of [...this.watchers]) {
      const concerned = changes.some((change) => isConcerned(watcher, change));
      if (concerned && this.watchers.has(watcher)) this.runOrDrop(watcher);
    }
  }

  /** Runs the watcher; if that fails, drops it, reports the failure and tells the watcher. */
  private runOrDrop(watcher: Watcher): void {
    try {
      watcher.run();
    } catch (error) {
      this.watchers.delete(watcher);
      this.report(error);
      watcher.dropped?.(error);
    }
  }
}
