import type { Session } from './models';
import { isLive } from './sessions';

/**
 * The single home of what a class code opens. The code is the key: it names a running class to anyone, an ended class only to
 * the device that holds a seat in it (so a student sees her own ended screen), and every class to the admin.
 * Any other code is unknown, exactly like a code that names no class.
 */
export function codeOpens(session: Session | null, caller: { isAdmin: boolean; holdsSeat: boolean }): session is Session {
  return session !== null && (caller.isAdmin || caller.holdsSeat || isLive(session));
}

/** Whether a lookup needs no check on how often it is made: the admin's, and a device that already has a seat in the class it names. */
export function lookupIsExempt(session: Session | null, caller: { isAdmin: boolean; holdsSeat: boolean }): boolean {
  return caller.isAdmin || (session !== null && caller.holdsSeat);
}
