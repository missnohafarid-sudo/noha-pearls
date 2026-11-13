import { isHeldToLimits } from './abuse';
import { holdsSeat } from './admission';
import type { Participant, Session } from './models';
import { isLive } from './sessions';

/** Who is asking for a class by its code: the admin or not, and the seat the device has in that class, if any. */
interface Asker {
  isAdmin: boolean;
  seat: Participant | null;
}

/**
 * The single home of what a class code opens. The code is the key: it names a running class to anyone, an ended class only to
 * a device that was let in to it (so a student sees her own ended screen; a seat still waiting does not count), and every class to the admin.
 * Any other code is unknown, exactly like a code that names no class.
 */
export function codeOpens(session: Session | null, asker: Asker): session is Session {
  return session !== null && (asker.isAdmin || holdsSeat(asker.seat) || isLive(session));
}

/** Whether a lookup needs no check on how often it is made: the admin's, and a device that was let in to the class it names. */
export function lookupIsExempt(session: Session | null, asker: Asker): boolean {
  return !isHeldToLimits(asker.isAdmin) || (session !== null && holdsSeat(asker.seat));
}
