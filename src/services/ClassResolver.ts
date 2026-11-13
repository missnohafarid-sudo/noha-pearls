import type { Session } from '../domain/models';
import type { Unsubscribe } from '../ports/store';

/**
 * The one way a public read or a join finds its class: by the class code, never by an internal id. A code names a class only
 * for a caller the rule `codeOpens` lets it open; otherwise the answer is null, the same as for a code that names none.
 */
export interface ClassResolver {
  /** The class this code opens for this caller now, and again whenever that changes; null when it opens none. A caller locked out of lookups is refused (`LimitError`). */
  watchSession(code: string, listener: (session: Session | null) => void): Unsubscribe;
  sessionOf(code: string): Promise<Session | null>;
}
