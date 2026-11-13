import { isLockedAt } from '../../domain/abuse';
import type { SqlDatabase } from '../../ports/sql';

interface Row {
  address: string;
  locked_until: number;
}

/**
 * The network addresses the hub refuses for a while: the only abuse record that outlives the hub's memory. A lock is one row;
 * the rows are read once, when the hub starts, and every question after that is answered from memory.
 */
export class AddressLocks {
  private readonly until = new Map<string, number>();

  constructor(private readonly db: SqlDatabase) {
    for (const row of db.all<Row>('SELECT address, locked_until FROM address_locks')) this.until.set(row.address, row.locked_until);
  }

  isLocked(address: string, now: number): boolean {
    return isLockedAt(this.until.get(address), now);
  }

  lock(address: string, lockedUntil: number): void {
    this.db.run('INSERT OR REPLACE INTO address_locks (address, locked_until) VALUES (?, ?)', address, lockedUntil);
    this.until.set(address, lockedUntil);
  }

  /** Forgets the locks that have ended. */
  prune(now: number): void {
    this.db.run('DELETE FROM address_locks WHERE locked_until <= ?', now);
    for (const [address, lockedUntil] of this.until) if (!isLockedAt(lockedUntil, now)) this.until.delete(address);
  }
}
