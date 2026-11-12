import type { Id, RetentionSettings } from '../domain/models';
import { dateOf, type CalendarDate } from '../domain/periods';
import {
  afterClearing,
  classesInRange,
  clearingNotice,
  isClearingDue,
  isValidRange,
  isValidYearEnd,
  noRetention,
  ownerSessionId,
  recentClearingDay,
  withYearEnd,
  type DateRange,
  type YearEnd,
} from '../domain/retention';
import type { Caller } from '../ports/caller';
import { SCHOOL_YEAR_CLEARED_COLLECTIONS, SESSION_CHILD_COLLECTIONS, type DocumentStore, type Unsubscribe } from '../ports/store';
import { requireAdmin } from './AuthService';

export type RetentionErrorCode = 'bad-range' | 'bad-year-end';

export class RetentionError extends Error {
  constructor(readonly code: RetentionErrorCode) {
    super(code);
    this.name = 'RetentionError';
  }
}

const RETENTION_ID: RetentionSettings['id'] = 'retention';

/** What the interface tells the admin about the clearing: the one coming within the notice period, and the one that just ran. */
export interface ClearingNotices {
  coming: CalendarDate | null;
  done: CalendarDate | null;
}

/** What is cleared out of the stored class data: ended classes of a class list between two dates, and everything of the students at the end of the school year. */
export class RetentionService {
  private clearing: Promise<boolean> | null = null;

  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly now: () => number = Date.now,
  ) {}

  watchSettings(listener: (settings: RetentionSettings | null) => void): Unsubscribe {
    requireAdmin(this.caller);
    return this.store.watch('retention', {}, (docs) => listener(docs[0] ?? null));
  }

  /** Tells which notices to show, now and whenever the settings change. */
  watchNotices(listener: (notices: ClearingNotices) => void): Unsubscribe {
    return this.watchSettings((settings) => {
      const now = this.now();
      listener({ coming: settings && clearingNotice(settings, now), done: settings && recentClearingDay(settings, now) });
    });
  }

  /** The day today on the school's clock: the limit of the dates to choose. */
  async rangeLimits(): Promise<{ today: CalendarDate }> {
    requireAdmin(this.caller);
    return { today: dateOf(this.now()) };
  }

  /** Sets the last day of the school year, or switches the yearly clearing off with null; the next clearing counts from now. Changes nothing else in the settings. */
  async setYearEnd(yearEnd: YearEnd | null): Promise<void> {
    requireAdmin(this.caller);
    if (yearEnd !== null && !isValidYearEnd(yearEnd)) throw new RetentionError('bad-year-end');
    const now = this.now();
    await this.ensureSettings(now);
    await this.store.update('retention', RETENTION_ID, (current) => withYearEnd(current, yearEnd, now));
  }

  /** The ended classes of the class list that started between the dates, to be shown and confirmed before they are removed. */
  async classesToRemove(classId: Id, range: DateRange): Promise<Id[]> {
    requireAdmin(this.caller);
    return (await this.endedClassesIn(classId, range)).map((session) => session.id);
  }

  /**
   * Removes the classes among `ids` that are still ended, still of the class list and still inside the range, each with everything it kept;
   * any other id is skipped. Returns how many it removed.
   */
  async removeClasses(classId: Id, range: DateRange, ids: readonly Id[]): Promise<number> {
    requireAdmin(this.caller);
    const confirmed = new Set(ids);
    const going = (await this.endedClassesIn(classId, range)).filter((session) => confirmed.has(session.id)).map((session) => session.id);
    await this.removeClassData(going);
    return going.length;
  }

  /**
   * When the school year has ended: empties every collection of class data whole, running classes and strays included, and last writes
   * when it was done, so an interruption repeats the clearing instead of skipping it. Lessons, folders, teachers and the site stay.
   * Returns whether it ran. A call made while another is running gets that one's result.
   */
  async clearIfDue(): Promise<boolean> {
    requireAdmin(this.caller);
    this.clearing ??= this.clearWhenDue().finally(() => {
      this.clearing = null;
    });
    return this.clearing;
  }

  private async clearWhenDue(): Promise<boolean> {
    const settings = await this.store.get('retention', RETENTION_ID);
    const now = this.now();
    if (!settings || !isClearingDue(settings, now)) return false;
    for (const collection of SCHOOL_YEAR_CLEARED_COLLECTIONS) {
      for (const doc of await this.store.list(collection)) await this.store.remove(collection, doc.id);
    }
    await this.store.update('retention', RETENTION_ID, (current) => afterClearing(current, now));
    return true;
  }

  private async ensureSettings(now: number): Promise<void> {
    if ((await this.store.get('retention', RETENTION_ID)) === null) await this.store.put('retention', noRetention(now));
  }

  private async endedClassesIn(classId: Id, range: DateRange) {
    if (!isValidRange(range)) throw new RetentionError('bad-range');
    return classesInRange(await this.store.list('sessions'), classId, range);
  }

  /** Removes what the classes kept, and the classes themselves last, so an interruption leaves classes that can be removed again and never data without its class. */
  private async removeClassData(sessionIds: readonly Id[]): Promise<void> {
    const going = new Set(sessionIds);
    for (const collection of SESSION_CHILD_COLLECTIONS) {
      for (const doc of await this.store.list(collection)) {
        if (going.has(ownerSessionId(doc))) await this.store.remove(collection, doc.id);
      }
    }
    for (const id of sessionIds) await this.store.remove('sessions', id);
  }
}
