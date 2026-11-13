import type { SqlDatabase } from '../../ports/sql';

/** The rows written on a UTC day, as last saved: a tiny table of the hub's database, not a collection. */
export class DailyWrites {
  constructor(private readonly db: SqlDatabase) {}

  rowsOn(day: number): number {
    return this.db.all<{ rows: number }>('SELECT rows FROM daily_writes WHERE day = ?', day)[0]?.rows ?? 0;
  }

  /** Saves the day's count and forgets the days before it. */
  save(day: number, rows: number): void {
    this.db.run('INSERT OR REPLACE INTO daily_writes (day, rows) VALUES (?, ?)', day, rows);
    this.db.run('DELETE FROM daily_writes WHERE day < ?', day);
  }
}
