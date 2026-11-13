import { afterWrongAttempt, isLocked, LOCK_MS, type AttemptRecord } from '../../domain/adminAccess';
import type { SqlDatabase } from '../../ports/sql';

interface Row {
  failures: number;
  last_at: number;
  locked_until: number;
}

/** The sign-in attempts of each network address: a small table of the hub's database, not a collection. */
export class SignInAttempts {
  constructor(private readonly db: SqlDatabase) {}

  /**
   * Counts an attempt as wrong before it is checked, in one step with reading the count, so attempts that arrive together cannot all
   * see the same count; `clear` takes the count back once the attempt turns out right. False when the address is locked, and then
   * nothing is counted. The step has no waiting in it, so nothing else runs in the middle of it.
   */
  begin(address: string, now: number): boolean {
    return this.db.transaction(() => {
      const known = this.get(address);
      if (isLocked(known, now)) return false;
      this.db.run('DELETE FROM sign_in_attempts WHERE last_at < ? AND locked_until < ?', now - LOCK_MS, now - LOCK_MS);
      const next = afterWrongAttempt(known, now);
      this.db.run('INSERT OR REPLACE INTO sign_in_attempts (address, failures, last_at, locked_until) VALUES (?, ?, ?, ?)', address, next.failures, next.lastAt, next.lockedUntil);
      return true;
    });
  }

  clear(address: string): void {
    this.db.run('DELETE FROM sign_in_attempts WHERE address = ?', address);
  }

  private get(address: string): AttemptRecord | null {
    const [row] = this.db.all<Row>('SELECT failures, last_at, locked_until FROM sign_in_attempts WHERE address = ?', address);
    return row ? { failures: row.failures, lastAt: row.last_at, lockedUntil: row.locked_until } : null;
  }
}
