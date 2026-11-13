import type { Id } from '../domain/models';
import type { ClassData } from '../domain/visibility';
import { MAX_CARD_RESULTS_PER_CLASS } from '../ports/limits';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { watchClassData } from './classData';
import { ComputedOnce } from './ComputedOnce';

/** What a class's data is at one moment, with the place where what every reader of it shows alike is computed once. */
export interface ClassSnapshot {
  data: ClassData | null;
  shared: ComputedOnce;
}

/** A live read of one class that many readers may hold at once. */
export interface ClassReads {
  watch(sessionId: Id, listener: (snapshot: ClassSnapshot) => void): Unsubscribe;
}

type Listener = (snapshot: ClassSnapshot) => void;
type Dropped = (error: unknown) => void;

interface Feed {
  sessionId: Id;
  /** Each listener with the way to tell its owner that the read was given up. */
  listeners: Map<Listener, Dropped | undefined>;
  latest: ClassSnapshot | null;
  stop: Unsubscribe;
  /** Set once nobody can be told any more and the store read is to be closed; `start` closes a read that was made after that. */
  over: boolean;
}

/**
 * One read of each watched class, shared by everyone who watches it: the store is asked once per change, not once per watcher,
 * and each change makes one `ClassSnapshot` for all of them. A class nobody watches is not read at all.
 */
export class ClassFeeds {
  private readonly feeds = new Map<Id, Feed>();

  /** `open` gives the store a feed reads through, told when the store gives up on a read. */
  constructor(
    private readonly open: (dropped: Dropped) => DocumentStore,
    private readonly report: (error: unknown) => void = () => undefined,
  ) {}

  /** The reads as one watcher holds them: `dropped` hears when the read is given up on. */
  reportingTo(dropped: Dropped): ClassReads {
    return { watch: (sessionId, listener) => this.watch(sessionId, listener, dropped) };
  }

  watch(sessionId: Id, listener: Listener, dropped?: Dropped): Unsubscribe {
    const feed = this.feeds.get(sessionId) ?? this.start(sessionId);
    feed.listeners.set(listener, dropped);
    if (feed.latest) this.deliver(feed, listener, feed.latest);
    return () => this.remove(feed, listener);
  }

  /** Takes a listener off its feed, and closes the store's read when no listener is left. */
  private remove(feed: Feed, listener: Listener): void {
    feed.listeners.delete(listener);
    if (feed.listeners.size === 0) this.close(feed);
  }

  private close(feed: Feed): void {
    if (feed.over) return;
    feed.over = true;
    if (this.feeds.get(feed.sessionId) === feed) this.feeds.delete(feed.sessionId);
    feed.stop();
  }

  private start(sessionId: Id): Feed {
    const feed: Feed = { sessionId, listeners: new Map(), latest: null, stop: () => undefined, over: false };
    this.feeds.set(sessionId, feed);
    const store = this.open((error) => this.giveUp(feed, error));
    try {
      feed.stop = watchClassData(store, sessionId, (data) => {
        feed.latest = { data, shared: new ComputedOnce({ maxEntries: MAX_CARD_RESULTS_PER_CLASS }) };
        for (const listener of [...feed.listeners.keys()]) this.deliver(feed, listener, feed.latest);
      });
    } catch (error) {
      this.feeds.delete(sessionId);
      throw error;
    }
    if (feed.over) feed.stop();
    return feed;
  }

  private deliver(feed: Feed, listener: Listener, snapshot: ClassSnapshot): void {
    if (!feed.listeners.has(listener)) return;
    try {
      listener(snapshot);
    } catch (error) {
      const dropped = feed.listeners.get(listener);
      this.remove(feed, listener);
      this.report(error);
      dropped?.(error);
    }
  }

  private giveUp(feed: Feed, error: unknown): void {
    this.close(feed);
    this.report(error);
    for (const dropped of [...feed.listeners.values()]) dropped?.(error);
    feed.listeners.clear();
  }
}

/** The reads of a place that has no hub to share them between its watchers (the page's own store): the services of one caller share one. */
export const classReadsOf = (store: DocumentStore): ClassReads => new ClassFeeds(() => store);
