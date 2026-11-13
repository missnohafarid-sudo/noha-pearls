import { isLockedAt, isSubjectOf, subjectOf, type LockKind, type OffenceRule } from '../domain/abuse';
import type { LockBook, WindowMemory } from '../ports/abuse';
import { KeyedWindows } from './KeyedWindows';

/**
 * One kind of offence: each one is counted against its subject, and the one that reaches the rule's count locks the subject for the
 * rule's time. The counts are the window memory's, the locks are the lock book's; where each is kept decides whether it outlives the hub's memory.
 */
export class Offences {
  private readonly windows: KeyedWindows;

  /** `memory` is where the counts are kept; omitted, they are kept in memory only. */
  constructor(
    private readonly kind: LockKind,
    private readonly rule: OffenceRule,
    private readonly locks: LockBook,
    private readonly now: () => number,
    memory?: WindowMemory,
  ) {
    this.windows = new KeyedWindows(rule, now, memory);
  }

  isLocked(key = ''): boolean {
    return isLockedAt(this.locks.lockedUntil(subjectOf(this.kind, key)), this.now());
  }

  /** Counts one offence and says whether it locked the subject. */
  record(key = ''): boolean {
    const subject = subjectOf(this.kind, key);
    this.windows.record(subject);
    if (this.windows.hasRoom(subject)) return false;
    this.windows.clear(subject);
    this.locks.lock(subject, this.now() + this.rule.lockMs);
    return true;
  }

  /** Takes the count and the lock back: the subject has shown it is no offender. */
  forgive(key = ''): void {
    const subject = subjectOf(this.kind, key);
    this.windows.clear(subject);
    this.locks.release(subject);
  }

  prune(): void {
    this.windows.prune((subject) => isSubjectOf(this.kind, subject));
  }
}
