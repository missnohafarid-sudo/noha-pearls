import type { Session } from '../../domain/models';
import { codeToFillIn, liveSessionForPage, sessionForPage } from '../../domain/sessions';
import { useAdmin, useSessionByCode, useSessions } from '../hooks/data';
import { sessionRoute, type SessionPageName } from '../routing/routes';
import { useFillAddress } from '../routing/useFillAddress';

/**
 * The class a page about one class shows; `undefined` while loading.
 * The teacher gets it by the rule in `domain/sessions.ts`: when that picks a running class, the address takes its code,
 * so a reload or a bookmark stays on that class; an ended class shown for lack of a running one leaves the address alone,
 * so the page follows a class that starts later. Anyone else gets a class only by the code she holds: no list, no filling.
 */
export function useShownSession(page: SessionPageName, code: string | undefined): Session | null | undefined {
  const admin = useAdmin();
  const sessions = useSessions();
  const byCode = useSessionByCode(admin ? null : (code ?? null));
  const rule = page === 'session' ? liveSessionForPage : sessionForPage;
  const shown = admin ? sessions && rule(sessions, code) : code === undefined ? null : byCode;

  const fill = admin ? codeToFillIn(shown ?? null, code) : null;
  useFillAddress(fill === null ? null : sessionRoute(page, fill));

  return shown;
}
