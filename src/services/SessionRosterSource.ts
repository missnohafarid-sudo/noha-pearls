import type { Id, SessionRoster } from '../domain/models';

/** Where the services learn the groups and students of a session. Never the class list: a session has its own. */
export interface SessionRosterSource {
  /** The roster of the session as stored right now; empty for a session that is not stored. */
  rosterOf(sessionId: Id): Promise<SessionRoster>;
}
