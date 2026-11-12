import { isLive } from '../../domain/sessions';
import type { Session } from '../../domain/models';
import { t } from '../../i18n';

/** Tells whether a class is still running or has ended, on every page that shows one. */
export function SessionStateChip({ session }: { session: Session }) {
  const live = isLive(session);
  return <span className={live ? 'chip chip--ok' : 'chip'}>{live ? t.common.sessionLive : t.common.sessionEnded}</span>;
}
