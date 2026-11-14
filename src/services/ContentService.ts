import type { SiteContent, SitePatch } from '../domain/models';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { requireAdmin } from './AuthService';

/** The editable text of the public pages. */
export class ContentService {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
  ) {}

  watchSite(listener: (site: SiteContent | null) => void): Unsubscribe {
    return this.store.watch('site', {}, (docs) => listener(docs[0] ?? null));
  }

  /** Changes only the fields in `patch`, merged into the stored record in one step, so patches on different fields never undo each other. */
  async updateSite(patch: SitePatch): Promise<void> {
    requireAdmin(this.caller);
    await this.store.update('site', 'site', (current) => ({ ...current, ...patch }));
  }
}
