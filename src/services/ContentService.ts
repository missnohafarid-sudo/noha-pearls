import type { SiteContent } from '../domain/models';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { AuthService } from './AuthService';

/** The editable text of the public pages. */
export class ContentService {
  constructor(
    private readonly store: DocumentStore,
    private readonly auth: AuthService,
  ) {}

  watchSite(listener: (site: SiteContent | null) => void): Unsubscribe {
    return this.store.watch('site', {}, (docs) => listener(docs[0] ?? null));
  }

  async updateSite(site: SiteContent): Promise<void> {
    this.auth.requireAdmin();
    await this.store.put('site', site);
  }
}
