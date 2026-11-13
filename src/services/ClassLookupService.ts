import type { Session } from '../domain/models';
import { anyClassLive } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';

/** What anyone may read of a class by its code. */
export class ClassLookupService {
  constructor(private readonly store: DocumentStore) {}

  /** Whether any class is running, and nothing about which. Open to anyone. */
  watchAnyLive(listener: (live: boolean) => void): Unsubscribe {
    return this.store.watch('sessions', {}, (sessions) => listener(anyClassLive(sessions)));
  }

  watchByCode(code: string, listener: (session: Session | null) => void): Unsubscribe {
    return this.store.watch('sessions', { code }, (sessions) => listener(sessions[0] ?? null));
  }
}
