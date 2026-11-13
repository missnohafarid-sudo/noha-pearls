import type { Id } from '../domain/models';
import { boardTotals, cardResults, type BoardTotal, type CardResults } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { watchClassData } from './classData';

/** What the public board reads of a class: the group totals, and one student's results once her card is read. */
export class BoardService {
  constructor(private readonly store: DocumentStore) {}

  watchTotals(sessionId: Id, listener: (totals: BoardTotal[]) => void): Unsubscribe {
    return watchClassData(this.store, sessionId, (data) => listener(data ? boardTotals(data) : []));
  }

  /** Null for a card no student of the class holds, and while the class has no lesson. */
  watchCardResults(sessionId: Id, cardNumber: number, listener: (results: CardResults | null) => void): Unsubscribe {
    return watchClassData(this.store, sessionId, (data) => listener(data && cardResults(data, cardNumber)));
  }
}
