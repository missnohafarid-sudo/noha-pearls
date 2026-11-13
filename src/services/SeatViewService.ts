import type { Id } from '../domain/models';
import { seatView, type ClassData, type Reader, type SeatView } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { watchClassData } from './classData';
import { combineWatches } from './combineWatches';
import type { ReaderSource } from './ReaderSource';

/** What a device the teacher let in shows of the class: the answer that counts for it, its results, its group's pearls and its classmates' hearts. */
export class SeatViewService {
  constructor(
    private readonly store: DocumentStore,
    private readonly readers: ReaderSource,
  ) {}

  /** Null unless this caller holds a let-in seat in the class. */
  watchMine(sessionId: Id, listener: (view: SeatView | null) => void): Unsubscribe {
    return combineWatches<[Reader, ClassData | null]>(
      [(emit) => this.readers.watchReader(sessionId, emit), (emit) => watchClassData(this.store, sessionId, emit)],
      (reader, data) => listener(reader.seat && data && seatView(reader.seat, data)),
    );
  }
}
