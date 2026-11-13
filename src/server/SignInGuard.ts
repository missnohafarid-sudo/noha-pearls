import { isCodeGuess, type SignInOutcome } from '../domain/adminAccess';
import type { LockBook, WindowMemory } from '../ports/abuse';
import { ADDRESS_WRONG_SIGN_INS, SCHOOL_CODE_GUESSES } from '../ports/limits';
import { Offences } from './Offences';

/**
 * What holds sign-in to its share. Five wrong attempts lock that network address. Ten wrong codes behind the right password, from
 * anywhere, close sign-in for everyone: a leaked password must not let the six digits be ground down. A wrong password never counts
 * toward that, so someone without the password cannot close sign-in. Counts and locks are kept in the database: the hub sleeps
 * between slow guesses.
 */
export class SignInGuard {
  private readonly addresses: Offences;
  private readonly codeGuesses: Offences;

  constructor(private readonly locks: LockBook, memory: WindowMemory, private readonly now: () => number) {
    this.addresses = new Offences('sign-in', ADDRESS_WRONG_SIGN_INS, locks, now, memory);
    this.codeGuesses = new Offences('school-sign-in', SCHOOL_CODE_GUESSES, locks, now, memory);
  }

  /**
   * Counts an attempt from this address as wrong before it is checked, so attempts that arrive together cannot all see the same
   * count; `finish` takes it back once the attempt turns out right. False when the address is locked or sign-in is closed.
   */
  begin(address: string): boolean {
    if (this.addresses.isLocked(address) || this.isClosed()) return false;
    this.addresses.record(address);
    return true;
  }

  /** Whether sign-in is closed for everyone, which the page is told so that it can say so. */
  isClosed(): boolean {
    return this.codeGuesses.isLocked();
  }

  /** Settles an attempt that `begin` let through. True only for a sign-in that is right and that no closure caught in flight. */
  finish(address: string, outcome: SignInOutcome): boolean {
    if (this.isClosed()) return false;
    if (isCodeGuess(outcome)) this.codeGuesses.record();
    if (outcome !== 'signed-in') return false;
    this.addresses.forgive(address);
    return true;
  }

  prune(): void {
    this.locks.prune(this.now());
    this.addresses.prune();
    this.codeGuesses.prune();
  }
}
