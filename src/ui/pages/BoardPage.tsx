import { useMemo, useState } from 'react';
import { REWARD_SOURCES, RewardIndex } from '../../domain/analytics';
import type { Group, Session, Student, SubjectRef } from '../../domain/models';
import { groupById, membersOf } from '../../domain/roster';
import { pearlsEarned, publishedKeys, rankScores, scoreboard, type GroupScore } from '../../domain/scoring';
import { t } from '../../i18n';
import pearlsRow from '../assets/brand/pearls-row.jpg';
import { HeartButton } from '../common/HeartButton';
import { Loading } from '../common/PageState';
import { PearlString } from '../common/PearlString';
import { toneStyle } from '../common/tone';
import { useAdmin, useAnswers, useLesson, useRewards, useSessionRoster } from '../hooks/data';
import { useTeacherHearts } from '../hooks/useTeacherHearts';
import { OwnResults } from '../board/OwnResults';
import { CardIdentify } from '../scanner/CardIdentify';
import { GroupStandingsOfClass } from '../standings/GroupStandingsOfClass';
import { SessionChooser } from '../session/SessionLists';
import { SessionStateChip } from '../session/SessionStateChip';
import { useShownSession } from '../session/useShownSession';
import { AdminPanel } from '../shell/AdminPanel';
import './board.css';

const banner = <img className="board__banner" src={pearlsRow} alt="" width={1792} height={592} />;

/** The reinforcement board of one class: group ranking by score, and every student's hearts. */
export function BoardPage({ code }: { code: string | undefined }) {
  const session = useShownSession('board', code);
  if (session === undefined) return <Loading />;
  if (session === null) {
    return (
      <div className="page">
        {banner}
        <h1 className="page__title">{t.shell.nav.board}</h1>
        <SessionChooser page="board" code={code} empty={<p className="notice">{t.board.empty}</p>} />
      </div>
    );
  }
  return <BoardView session={session} />;
}

function BoardView({ session }: { session: Session }) {
  const admin = useAdmin();
  const lesson = useLesson(session.lessonId);
  const roster = useSessionRoster(session);
  const answers = useAnswers(session.id);
  const rewards = useRewards(session.id);
  const [identified, setIdentified] = useState<Student | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const heartFor = useTeacherHearts(session);

  const scores = useMemo(
    () => (lesson && roster && answers ? scoreboard(lesson, roster, answers, publishedKeys(session)) : []),
    [lesson, roster, answers, session],
  );
  const index = useMemo(() => new RewardIndex(rewards ?? []), [rewards]);

  if (lesson === undefined || !roster || !answers || !rewards) return <Loading />;
  const { groups, students } = roster;

  const giveTo = (target: SubjectRef) => heartFor(roster, target);
  const groupOf = (score: GroupScore): Group | null => groupById(groups, score.groupId);
  const ranked = rankScores(scores);

  return (
    <div className="page">
      {banner}
      <header className="row">
        <h1 className="page__title">{t.shell.nav.board}</h1>
        <SessionStateChip session={session} />
      </header>

      <section className="stack">
        <h2 className="card__title">{t.board.leaderboard}</h2>
        <ol className="board__ranking list-reset">
          {ranked.map((score) => {
            const group = groupOf(score);
            if (!group) return null;
            return (
              <li key={group.id} className="card board__rank" style={toneStyle(group.color)}>
                <span className="board__position">{score.rank}</span>
                <div className="stack stack--tight board__rank-main">
                  <strong>{group.name}</strong>
                  <PearlString earned={pearlsEarned(score)} />
                </div>
                <span className="muted">{t.common.scoreOf(score.score, score.max)}</span>
                <HeartButton
                  owner={group.name}
                  count={index.groupTotal(group, students)}
                  onGive={giveTo({ kind: 'group', id: group.id })}
                />
              </li>
            );
          })}
        </ol>
      </section>

      <GroupStandingsOfClass session={session} />

      {admin ? (
        <section className="stack">
          <h2 className="card__title">{t.board.groupsHearts}</h2>
          <div className="grid">
            {groups.map((group) => {
              const members = membersOf(group.id, students);
              return (
                <article key={group.id} className="card card--tone stack" style={toneStyle(group.color)}>
                  <h3 className="card__title">{group.name}</h3>
                  {members.length === 0 && <p className="muted">{t.board.noStudents}</p>}
                  {members.map((student) => {
                    const tally = index.of({ kind: 'student', id: student.id });
                    return (
                      <div key={student.id} className="stack stack--tight">
                        <div className="row row--between">
                          <span>{student.name}</span>
                          <HeartButton
                            owner={student.name}
                            count={tally.total}
                            onGive={giveTo({ kind: 'student', id: student.id })}
                          />
                        </div>
                        <div className="row">
                          {REWARD_SOURCES.filter((source) => tally.bySource[source] > 0).map((source) => (
                            <span key={source} className="chip">
                              {t.common.rewardSource[source]} {tally.bySource[source]}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="stack">
          {identified && lesson ? (
            <OwnResults
              session={session}
              lesson={lesson}
              answers={answers}
              student={identified}
              group={groupById(groups, identified.groupId)}
              hearts={index.of({ kind: 'student', id: identified.id })}
              onHide={() => setIdentified(null)}
            />
          ) : (
            <div className="card stack">
              <p className="muted">{t.board.showMineHint}</p>
              <button type="button" className="btn btn--primary" onClick={() => setIdentifying(true)}>
                {t.board.showMine}
              </button>
            </div>
          )}
        </section>
      )}
      {identifying && (
        <CardIdentify
          students={students}
          onIdentified={(student) => {
            setIdentified(student);
            setIdentifying(false);
          }}
          onClose={() => setIdentifying(false)}
        />
      )}

      <AdminPanel title={t.board.panelTitle}>
        <p className="muted">{t.board.panelBody}</p>
      </AdminPanel>
    </div>
  );
}
