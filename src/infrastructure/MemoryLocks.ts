import { isLockedAt } from '../domain/abuse';
import type { LockBook } from '../ports/abuse';

/** Locks that live only as long as the hub's memory: for a device, which escapes any lock by dropping its cookie, so keeping them in the database would buy nothing and cost a row each. */
export class MemoryLocks implements LockBook {
  private readonly until = new Map<string, number>();

  lockedUntil(subject: string): number | undefined {
    return this.until.get(subject);
  }

  lock(subject: string, lockedUntil: number): void {
    this.until.set(subject, lockedUntil);
  }

  release(subject: string): void {
    this.until.delete(subject);
  }

  prune(now: number): void {
    for (const [subject, lockedUntil] of this.until) if (!isLockedAt(lockedUntil, now)) this.until.delete(subject);
  }
}
