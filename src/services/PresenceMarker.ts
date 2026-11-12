import type { Id } from '../domain/models';

/** How the services that let a device in or record a teacher-entered answer say who is here. Neither writes the roster itself. */
export interface PresenceMarker {
  /** Puts these students on the roll, starting one when none was taken. */
  joinRoll(sessionId: Id, studentIds: readonly Id[]): Promise<void>;
  /** Puts these students on the roll if one was taken; starts none. */
  addToRoll(sessionId: Id, studentIds: readonly Id[]): Promise<void>;
}
