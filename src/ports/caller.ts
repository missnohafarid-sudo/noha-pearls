import type { Id } from '../domain/models';

/** Who is asking. Decided by where a request comes from, never by its arguments. */
export interface Caller {
  isAdmin(): boolean;
  /** The lasting identity of the device that is asking. */
  deviceId(): Id;
}
