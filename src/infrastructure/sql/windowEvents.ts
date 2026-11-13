import type { WindowMemory } from '../../ports/abuse';
import type { SqlDatabase } from '../../ports/sql';

/** The moments of counted events, one row per key: the counts that must survive the hub's sleep. */
export class SqlWindowMemory implements WindowMemory {
  constructor(private readonly db: SqlDatabase) {}

  get(key: string): readonly number[] | undefined {
    const [row] = this.db.all<{ times: string }>('SELECT times FROM window_events WHERE subject = ?', key);
    return row ? (JSON.parse(row.times) as number[]) : undefined;
  }

  set(key: string, times: number[]): void {
    this.db.run('INSERT OR REPLACE INTO window_events (subject, times) VALUES (?, ?)', key, JSON.stringify(times));
  }

  delete(key: string): void {
    this.db.run('DELETE FROM window_events WHERE subject = ?', key);
  }

  keys(): string[] {
    return this.db.all<{ subject: string }>('SELECT subject FROM window_events').map((row) => row.subject);
  }
}
