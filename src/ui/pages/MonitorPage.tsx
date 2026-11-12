import { useMemo } from 'react';
import { buildMonitor, RewardIndex } from '../../domain/analytics';
import { minInteractions, possibleInteractions } from '../../domain/engagement';
import { teacherKeys } from '../../domain/scoring';
import { acceptsChanges, isLive } from '../../domain/sessions';
import type { Id, Session } from '../../domain/models';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import { useAnswers, useLesson, useParticipants, useRewards, useSessionRoster } from '../hooks/data';
import { RouteLink } from '../routing/useRoute';
import { SessionChooser } from '../session/SessionLists';
import { useShownSession } from '../session/useShownSession';
import { useServices } from '../ServicesContext';
import { MinInteractions } from '../session/MinInteractions';
import { MonitorGroupCard } from '../session/MonitorGroupCard';
import { SessionStateChip } from '../session/SessionStateChip';
import './monitor.css';

/** The teacher's table of who answered what, per group. */
export function MonitorPage({ code }: { code: string | undefined }) {
  const session = useShownSession('monitor', code);
  if (session === undefined) return <Loading />;
  if (session === null) {
    return (
      <div className="page">
        <h1 className="page__title">{t.shell.nav.monitor}</h1>
        <SessionChooser
          page="monitor"
          code={code}
          empty={
            <div className="stack">
              <p className="muted">{t.monitor.none}</p>
              <RouteLink to={{ name: 'session' }} className="btn btn--primary">
                {t.monitor.goSession}
              </RouteLink>
            </div>
          }
        />
      </div>
    );
  }
  return <MonitorView session={session} />;
}

function MonitorView({ session }: { session: Session }) {
  const { rewards, sessions, sessionRoster } = useServices();
  const lesson = useLesson(session.lessonId);
  const roster = useSessionRoster(session);
  const answers = useAnswers(session.id);
  const participants = useParticipants(session.id);
  const rewardList = useRewards(session.id);

  const monitor = useMemo(
    () => (lesson && roster && answers && participants ? buildMonitor(lesson, session, roster, answers, participants, teacherKeys(session)) : null),
    [lesson, roster, answers, participants, session],
  );
  const index = useMemo(() => new RewardIndex(rewardList ?? []), [rewardList]);

  if (lesson === undefined || !rewardList) return <Loading />;
  if (lesson === null) return <p className="page notice notice--bad">{t.monitor.lessonDeleted}</p>;
  if (!monitor || !roster || !answers) return <Loading />;

  const give = (studentId: Id) => void rewards.giveAsTeacher(session.id, { kind: 'student', id: studentId });
  const setPresent = (studentId: Id, present: boolean) =>
    void (present ? sessionRoster.markPresent(session.id, studentId) : sessionRoster.markAbsent(session.id, studentId));
  const canChange = acceptsChanges(session);
  const possible = possibleInteractions(session, lesson, answers);
  const minimum = minInteractions(session, lesson, answers);

  return (
    <div className="page">
      <header className="stack stack--tight">
        <h1 className="page__title">{lesson.title}</h1>
        <div className="row">
          <SessionStateChip session={session} />
          {isLive(session) && <span className="muted">{t.monitor.onSlide(session.slideIndex + 1)}</span>}
          <MinInteractions
            value={minimum}
            max={possible}
            onChange={canChange ? (value) => void sessions.setMinInteractions(session.id, value) : undefined}
          />
        </div>
      </header>
      {monitor.map((entry) => (
        <MonitorGroupCard
          key={entry.group.id}
          entry={entry}
          rewards={index}
          possible={possible}
          onGive={give}
          onSetPresent={canChange ? setPresent : undefined}
        />
      ))}
    </div>
  );
}
