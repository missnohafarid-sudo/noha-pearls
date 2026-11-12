import type { Id } from '../domain/models';

/** How the service that ends a class has what it came to kept. */
export interface RecordKeeper {
  /** Keeps the record of an ended class, once; a class that is live, unknown or has lost its lesson keeps none. */
  keep(sessionId: Id): Promise<void>;
}
