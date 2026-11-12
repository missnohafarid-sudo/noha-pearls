import type { Id, Participant } from '../domain/models';

/** Where the services learn which seat this device holds. A device is never told by its caller. */
export interface SeatSource {
  /** This device's seat in the session, as stored right now, if the teacher has let it in; otherwise null. */
  admittedSeat(sessionId: Id): Promise<Participant | null>;
}
