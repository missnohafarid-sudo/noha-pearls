import type { SqlDatabase } from '../../ports/sql';

/** The teacher's sessions: a cookie counts only while its row is here and has not run out. */
export class AdminSessionTable {
  constructor(private readonly db: SqlDatabase) {}

  add(id: string, expiresAt: number): void {
    this.db.run('INSERT OR REPLACE INTO admin_sessions (id, expires_at) VALUES (?, ?)', id, expiresAt);
  }

  /** The moment the session ends, or null when there is no such session. */
  expiryOf(id: string): number | null {
    return this.db.all<{ expires_at: number }>('SELECT expires_at FROM admin_sessions WHERE id = ?', id)[0]?.expires_at ?? null;
  }

  remove(id: string): void {
    this.db.run('DELETE FROM admin_sessions WHERE id = ?', id);
  }

  /** Forgets the sessions that have ended. */
  prune(now: number): void {
    this.db.run('DELETE FROM admin_sessions WHERE expires_at <= ?', now);
  }
}
