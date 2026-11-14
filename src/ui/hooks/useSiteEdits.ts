import type { SitePatch } from '../../domain/models';
import { useAttempt } from '../common/useAttempt';
import { useServices } from '../ServicesContext';

/** How long the page waits after the last edit of the site record before it sends the edits together, in milliseconds. */
const SITE_SAVE_DELAY_MS = 300;

type Send = (patch: SitePatch) => void;

/** One queue for the whole page, so the home form and the look button never send a record of their own: their edits travel as one patch. */
let pending: SitePatch = {};
let send: Send | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let leavingWatched = false;

function flush(): void {
  clearTimeout(timer);
  const patch = pending;
  pending = {};
  if (send && Object.keys(patch).length > 0) send(patch);
}

function queue(patch: SitePatch, sendPatch: Send): void {
  pending = { ...pending, ...patch };
  send = sendPatch;
  clearTimeout(timer);
  timer = setTimeout(flush, SITE_SAVE_DELAY_MS);
  if (!leavingWatched) {
    window.addEventListener('pagehide', flush);
    leavingWatched = true;
  }
}

/** Edits of the site record: each is merged into the pending patch, which is sent once no new edit has come for a short while. */
export function useSiteEdits() {
  const { content } = useServices();
  const { error, attempt } = useAttempt();
  const edit = (patch: SitePatch): void => {
    if (Object.keys(patch).length > 0) queue(patch, (merged) => void attempt(() => content.updateSite(merged)));
  };
  return { edit, error };
}
