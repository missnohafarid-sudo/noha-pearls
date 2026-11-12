import type { Lesson, Session } from '../../domain/models';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { sessionRoute } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import { AdminPanel } from '../shell/AdminPanel';
import { useServices } from '../ServicesContext';

/** Side-panel overview of the live class: its groups for today, the other screens, the way back to all classes and the way to end it. */
export function ClassPanel({ session, lesson, onRegroup }: { session: Session; lesson: Lesson | null; onRegroup: () => void }) {
  const { sessions } = useServices();
  return (
    <AdminPanel title={t.session.classTitle}>
      <div className="stack stack--tight">
        {lesson && <strong>{lesson.title}</strong>}
        <span className="muted">{t.session.whose(session.className, session.teacherName)}</span>
        <span className="muted">{t.session.joinCodeIs(session.code)}</span>
        <button type="button" className="btn btn--small" onClick={onRegroup}>
          {t.session.groupsToday.open}
        </button>
        <RouteLink to={sessionRoute('monitor', session.code)} className="btn btn--small">
          {t.shell.nav.monitor}
        </RouteLink>
        <RouteLink to={sessionRoute('board', session.code)} className="btn btn--small">
          {t.shell.nav.board}
        </RouteLink>
        <RouteLink to={{ name: 'session' }} className="muted">
          {t.session.allClasses}
        </RouteLink>
        <ConfirmButton onConfirm={() => void sessions.end(session.id)}>{t.session.end}</ConfirmButton>
      </div>
    </AdminPanel>
  );
}
