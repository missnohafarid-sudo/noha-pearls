import { boardTotals, cardResults, type BoardTotal, type CardResults } from '../domain/visibility';
import type { AbuseGuard } from '../ports/abuse';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { watchByCode } from './classData';
import type { ClassResolver } from './ClassResolver';
import { classReadsOf, type ClassReads } from './ClassFeeds';
import { requireWithin } from './LimitError';

/** What the public board reads of a class by its code: the group totals, and one student's results once her card is read. Every watcher of a class is shown the same, so each is computed once per change. */
export class BoardService {
  constructor(
    store: DocumentStore,
    private readonly codes: ClassResolver,
    private readonly guard: AbuseGuard,
    private readonly classes: ClassReads = classReadsOf(store),
  ) {}

  watchTotals(code: string, listener: (totals: BoardTotal[]) => void): Unsubscribe {
    return watchByCode<BoardTotal[]>(
      this.codes, code, (session) => (emit) => this.classes.watch(session.id, ({ data, shared }) => emit(data ? shared.get('totals', () => boardTotals(data)) : [])), [], listener,
    );
  }

  /** Null for a card no student of the class holds, and while the class has no lesson. A connection may ask for only so many different cards in a while. */
  watchCardResults(code: string, cardNumber: number, listener: (results: CardResults | null) => void): Unsubscribe {
    requireWithin(this.guard.cardAllowed(cardNumber), 'cards');
    return watchByCode<CardResults | null>(
      this.codes, code, (session) => (emit) => this.classes.watch(session.id, ({ data, shared }) => emit(data && shared.get(`card|${cardNumber}`, () => cardResults(data, cardNumber)))), null, listener,
    );
  }
}
