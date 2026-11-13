import type { Session, SessionRoster } from '../domain/models';
import { anyClassLive, sessionFor, type Reader } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { combineWatches, followWatch, type Watch } from './combineWatches';
import type { ReaderSource } from './ReaderSource';
import type { SessionRosterSource } from './SessionRosterSource';

/** What anyone may read of a class by its code. */
export class ClassLookupService {
  constructor(
    private readonly store: DocumentStore,
    private readonly readers: ReaderSource,
    private readonly rosters: SessionRosterSource,
  ) {}

  /** Whether any class is running, and nothing about which. Open to anyone. */
  watchAnyLive(listener: (live: boolean) => void): Unsubscribe {
    return this.store.watch('sessions', {}, (sessions) => listener(anyClassLive(sessions)));
  }

  /**
   * The class a code names, as this caller may read it (`sessionFor`): whole for the admin, with only her own group's message
   * for a let-in seat, without reveals or message for anyone else. Follows the caller's seat once the code resolves.
   */
  watchByCode(code: string, listener: (session: Session | null) => void): Unsubscribe {
    const named: Watch<Session | null> = (emit) => this.store.watch('sessions', { code }, (sessions) => emit(sessions[0] ?? null));
    const readingOf = (session: Session | null): Watch<{ reader: Reader; roster: SessionRoster } | null> => (emit) => {
      if (!session) {
        emit(null);
        return () => undefined;
      }
      return combineWatches<[Reader, SessionRoster]>(
        [(next) => this.readers.watchReader(session.id, next), (next) => this.rosters.watchRosterOf(session.id, next)],
        (reader, roster) => emit({ reader, roster }),
      );
    };
    return followWatch(named, (session) => session?.id ?? '', readingOf)(([session, reading]) =>
      listener(session && reading && sessionFor(reading.reader, session, reading.roster.students)),
    );
  }
}
