import { sessionForPage } from '../../domain/sessions';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import { useSessions } from '../hooks/data';
import { LiveSession } from '../session/LiveSession';
import { SessionOverview } from '../session/SessionOverview';
import { useShownSession } from '../session/useShownSession';
import './session.css';

/** The teacher's live class, opened by its code: present it and steer the groups; without a running class, the overview, saying so when the code named one that ended or none at all. */
export function SessionPage({ code }: { code: string | undefined }) {
  const session = useShownSession('session', code);
  const sessions = useSessions();
  if (session === undefined || !sessions) return <Loading />;
  if (session) return <LiveSession session={session} />;
  if (code === undefined) return <SessionOverview notice={null} />;
  return <SessionOverview notice={sessionForPage(sessions, code) ? t.session.endedCode(code) : t.session.unknownCode(code)} />;
}
