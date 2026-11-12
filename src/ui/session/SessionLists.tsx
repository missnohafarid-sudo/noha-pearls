import type { ReactNode } from 'react';
import type { Session } from '../../domain/models';
import { liveSessions } from '../../domain/sessions';
import { t } from '../../i18n';
import { useLessons, useSessions } from '../hooks/data';
import { sessionRoute, type SessionPageName } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import './sessionLists.css';

const ts = t.session.chooser;

/** One class per row: its lesson, whose it is, when it started, its code, and the links the caller gives it. */
function SessionRows({ sessions, actions }: { sessions: readonly Session[]; actions: (session: Session) => ReactNode }) {
  const lessons = useLessons();
  const titleOf = (session: Session) => lessons?.find((lesson) => lesson.id === session.lessonId)?.title ?? ts.lessonGone;
  return (
    <ul className="session-list list-reset">
      {sessions.map((session) => (
        <li key={session.id} className="session-list__item">
          <div className="stack stack--tight">
            <strong>{titleOf(session)}</strong>
            <span className="muted">{t.session.whose(session.className, session.teacherName)}</span>
            <span className="muted">
              {ts.started(session.startedAt)} · {t.session.joinCode}: <bdi className="session-list__code">{session.code}</bdi>
            </span>
          </div>
          <div className="row">{actions(session)}</div>
        </li>
      ))}
    </ul>
  );
}

/** The classes running now, each opening `page` for that class. */
export function LiveSessionList({ sessions, page }: { sessions: readonly Session[]; page: SessionPageName }) {
  return (
    <section className="stack">
      <h2 className="card__title">{ts.title}</h2>
      <SessionRows
        sessions={sessions}
        actions={(session) => (
          <RouteLink to={sessionRoute(page, session.code)} className="btn btn--small btn--primary">
            {ts.open[page]}
          </RouteLink>
        )}
      />
    </section>
  );
}

/**
 * What a page about one class shows when it has no class to present: the code that matched nothing, if the address had one,
 * then the choice among the running classes, else `empty` (only when the address named no code).
 */
export function SessionChooser({ page, code, empty }: { page: SessionPageName; code: string | undefined; empty: ReactNode }) {
  const sessions = useSessions();
  const live = sessions ? liveSessions(sessions) : [];
  return (
    <>
      {code !== undefined && <p className="notice">{t.session.unknownCode(code)}</p>}
      {live.length > 0 ? <LiveSessionList sessions={live} page={page} /> : code === undefined && empty}
    </>
  );
}

/** The classes that ended most recently, each with the links to its results. */
export function EndedSessionList({ sessions }: { sessions: readonly Session[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="stack">
      <h2 className="card__title">{ts.endedTitle}</h2>
      <SessionRows
        sessions={sessions}
        actions={(session) =>
          (['monitor', 'board'] as const).map((page) => (
            <RouteLink key={page} to={sessionRoute(page, session.code)} className="btn btn--small">
              {t.shell.nav[page]}
            </RouteLink>
          ))
        }
      />
    </section>
  );
}
