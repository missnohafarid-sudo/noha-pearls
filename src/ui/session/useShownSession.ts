import type { Session } from '../../domain/models';
import { codeToFillIn, liveSessionForPage, sessionForPage } from '../../domain/sessions';
import { useSessions } from '../hooks/data';
import { sessionRoute, type SessionPageName } from '../routing/routes';
import { useFillAddress } from '../routing/useFillAddress';

/**
 * The class a page about one class shows, by the rule in `domain/sessions.ts`; `undefined` while loading.
 * When the rule picks a running class, the address takes its code, so a reload or a bookmark stays on that class;
 * an ended class shown for lack of a running one leaves the address alone, so the page follows a class that starts later.
 */
export function useShownSession(page: SessionPageName, code: string | undefined): Session | null | undefined {
  const sessions = useSessions();
  const rule = page === 'session' ? liveSessionForPage : sessionForPage;
  const shown = sessions && rule(sessions, code);

  const fill = codeToFillIn(shown ?? null, code);
  useFillAddress(fill === null ? null : sessionRoute(page, fill));

  return shown;
}
