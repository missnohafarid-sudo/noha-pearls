import type { Id, Lesson, Session } from '../domain/models';
import { classLessonFor, seatView, type Reader, type SeatView } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { watchSessionAndLesson } from './classData';
import { classReadsOf, type ClassReads, type ClassSnapshot } from './ClassFeeds';
import { followWatch, noRead, type Watch } from './combineWatches';
import type { ReaderSource } from './ReaderSource';

/**
 * What a device the teacher let in shows of its class: the answer that counts for it, its results, its group's pearls, its classmates' hearts and its lesson.
 * The class is read only while the reader may see it, which a seat in it or the admin gives: any other caller, and any invented class, costs nothing when the class changes.
 */
export class SeatViewService {
  constructor(
    private readonly store: DocumentStore,
    private readonly readers: ReaderSource,
    private readonly classes: ClassReads = classReadsOf(store),
  ) {}

  /** Null unless this caller holds a let-in seat in the class. Her seat and the class data are read together, so her group is the one the same roster gives. */
  watchMine(sessionId: Id, listener: (view: SeatView | null) => void): Unsubscribe {
    const classOf = (reader: Reader): Watch<ClassSnapshot | null> => (reader.seat ? (emit) => this.classes.watch(sessionId, emit) : noRead(null));
    return followWatch(
      (emit) => this.readers.watchReader(sessionId, emit),
      (reader) => (reader.seat ? 'seat' : 'none'),
      classOf,
    )(([reader, snapshot]) => listener(reader.seat && snapshot?.data ? seatView(reader.seat, snapshot.data) : null));
  }

  /** The lesson of one class, even when it is not published: whole for the admin, without its key and with only the hidden parts the teacher has opened for a let-in seat of the class, null for anyone else. */
  watchLesson(sessionId: Id, listener: (lesson: Lesson | null) => void): Unsubscribe {
    const lessonOf = (reader: Reader): Watch<[Session | null, Lesson | null]> => (reader.isAdmin || reader.seat ? watchSessionAndLesson(this.store, sessionId) : noRead([null, null]));
    return followWatch(
      (emit) => this.readers.watchReader(sessionId, emit),
      (reader) => (reader.isAdmin || reader.seat ? 'read' : 'none'),
      lessonOf,
    )(([reader, [session, lesson]]) => listener(classLessonFor(reader, lesson, session)));
  }
}
