import type { Id, Lesson } from '../domain/models';
import { classLessonFor, seatView, type ClassData, type Reader, type SeatView } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { watchClassData, watchSessionAndLesson } from './classData';
import { combineWatches } from './combineWatches';
import type { ReaderSource } from './ReaderSource';

/** What a device the teacher let in shows of its class: the answer that counts for it, its results, its group's pearls, its classmates' hearts and its lesson. */
export class SeatViewService {
  constructor(
    private readonly store: DocumentStore,
    private readonly readers: ReaderSource,
  ) {}

  /** Null unless this caller holds a let-in seat in the class. Her seat and the class data are read together, so her group is the one the same roster gives. */
  watchMine(sessionId: Id, listener: (view: SeatView | null) => void): Unsubscribe {
    return combineWatches<[Reader, ClassData | null]>(
      [(emit) => this.readers.watchReader(sessionId, emit), (emit) => watchClassData(this.store, sessionId, emit)],
      (reader, data) => listener(reader.seat && data && seatView(reader.seat, data)),
    );
  }

  /** The lesson of one class, even when it is not published: whole for the admin, without its key for a let-in seat of the class, null for anyone else. */
  watchLesson(sessionId: Id, listener: (lesson: Lesson | null) => void): Unsubscribe {
    return combineWatches<[Reader, [unknown, Lesson | null]]>(
      [(emit) => this.readers.watchReader(sessionId, emit), watchSessionAndLesson(this.store, sessionId)],
      (reader, [, lesson]) => listener(classLessonFor(reader, lesson)),
    );
  }
}
