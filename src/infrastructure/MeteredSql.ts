import { utcDayOf } from '../domain/abuse';
import { DAY_ROWS_FLUSH_MS } from '../ports/limits';
import type { SqlDatabase, SqlValue } from '../ports/sql';
import { DailyWrites } from './sql/dailyWrites';

/**
 * A database that adds up the rows each statement reports written, for the UTC day. The count is kept in memory and saved at most
 * once a minute, so that counting costs one row a minute and not one per write; a restart reads back what was saved.
 */
export class MeteredSql implements SqlDatabase {
  private readonly saved: DailyWrites;
  private day: number;
  private rows: number;
  private savedAt: number;
  private unsaved = false;

  /** The tables must exist already (`migrate`). */
  constructor(
    private readonly inner: SqlDatabase,
    private readonly now: () => number,
  ) {
    this.saved = new DailyWrites(inner);
    this.day = utcDayOf(now());
    this.rows = this.saved.rowsOn(this.day);
    this.savedAt = now();
  }

  /** Rows written so far on the current UTC day; a new day starts from nothing. */
  rowsToday(): number {
    this.startNewDayIfDue();
    return this.rows;
  }

  /** Saves the count if it changed since it was last saved. */
  flush(): void {
    this.startNewDayIfDue();
    if (!this.unsaved) return;
    this.saved.save(this.day, this.rows);
    this.unsaved = false;
    this.savedAt = this.now();
  }

  run(statement: string, ...params: SqlValue[]): number {
    const written = this.inner.run(statement, ...params);
    this.startNewDayIfDue();
    this.rows += written;
    this.unsaved ||= written > 0;
    if (this.unsaved && this.now() - this.savedAt >= DAY_ROWS_FLUSH_MS) this.flush();
    return written;
  }

  all<Row>(statement: string, ...params: SqlValue[]): Row[] {
    return this.inner.all<Row>(statement, ...params);
  }

  transaction<T>(work: () => T): T {
    return this.inner.transaction(work);
  }

  private startNewDayIfDue(): void {
    const today = utcDayOf(this.now());
    if (today === this.day) return;
    this.day = today;
    this.rows = 0;
    this.unsaved = true;
  }
}
