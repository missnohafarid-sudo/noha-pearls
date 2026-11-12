import type { SiteContent } from '../domain/models';
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

  async updateSite(site: SiteContent): Promise<void> {
    requireAdmin(this.caller);
    await this.store.put('site', site);
  }
}
