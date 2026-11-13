import type { LockBook } from '../../ports/abuse';
import type { SqlDatabase } from '../../ports/sql';

/**
 * The locks that must outlive the hub's sleep (the sign-in ones): one row each, read by its key when asked and never all at once,
 * so a hub that wakes reads nothing of them.
 */
export class SqlLocks implements LockBook {
  constructor(private readonly db: SqlDatabase) {}

  lockedUntil(subject: string): number | undefined {
    return this.db.all<{ locked_until: number }>('SELECT locked_until FROM locks WHERE subject = ?', subject)[0]?.locked_until;
  }

  lock(subject: string, lockedUntil: number): void {
    this.db.run('INSERT OR REPLACE INTO locks (subject, locked_until) VALUES (?, ?)', subject, lockedUntil);
  }

  release(subject: string): void {
    this.db.run('DELETE FROM locks WHERE subject = ?', subject);
  }

  prune(now: number): void {
    this.db.run('DELETE FROM locks WHERE locked_until <= ?', now);
  }
}
