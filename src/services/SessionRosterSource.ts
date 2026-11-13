import type { Id, SessionRoster } from '../domain/models';
import type { Unsubscribe } from '../ports/store';

/** Stands for the roster of a session that is not stored. */
export const NO_ROSTER: SessionRoster = { id: '', groups: [], students: [], present: null };

/** Where the services learn the groups and students of a session. Never the class list: a session has its own. */
export interface SessionRosterSource {
  /** The roster of the session as stored right now; empty for a session that is not stored. */
  rosterOf(sessionId: Id): Promise<SessionRoster>;
  /** The same, live, with the roll and card numbers: for services that decide what a caller may see of it. */
  watchRosterOf(sessionId: Id, listener: (roster: SessionRoster) => void): Unsubscribe;
}
