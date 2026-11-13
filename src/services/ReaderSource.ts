import type { Id } from '../domain/models';
import type { Reader } from '../domain/visibility';
import type { Unsubscribe } from '../ports/store';

/** Where the services learn who is reading: the caller's admin standing and the seat it holds, following admission, removal and regrouping. */
export interface ReaderSource {
  watchReader(sessionId: Id, listener: (reader: Reader) => void): Unsubscribe;
}
