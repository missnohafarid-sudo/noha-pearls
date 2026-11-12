import { liveSessions, recentlyEnded } from '../../domain/sessions';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import { useSessions } from '../hooks/data';
import { EndedSessionList, LiveSessionList } from './SessionLists';
import { StartSession } from './StartSession';
import { TeachersPanel } from './TeachersPanel';

/** The teacher's session page when it names no running class: `notice` says why when its address named one that is not running; then the classes to resume, a new class to start, and the ones that just ended. */
export function SessionOverview({ notice }: { notice: string | null }) {
  const sessions = useSessions();
  if (!sessions) return <Loading />;
  const live = liveSessions(sessions);
  return (
    <div className="page">
      <h1 className="page__title">{t.shell.nav.session}</h1>
      {notice && <p className="notice">{notice}</p>}
      {live.length > 0 && <LiveSessionList sessions={live} page="session" />}
      <StartSession />
      <EndedSessionList sessions={recentlyEnded(sessions)} />
      <TeachersPanel />
    </div>
  );
}
