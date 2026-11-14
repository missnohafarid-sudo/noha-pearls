import { useMemo } from 'react';
import { REWARD_SOURCES, RewardIndex } from '../../domain/analytics';
import type { ClassRoster, Id, SubjectRef } from '../../domain/models';
import { membersOf } from '../../domain/roster';
import { t } from '../../i18n';
import { HeartButton } from '../common/HeartButton';
import { Loading } from '../common/PageState';
import { toneStyle } from '../common/tone';
import { useRewards } from '../hooks/data';
import type { TeacherHeartActions } from '../hooks/useTeacherHearts';

interface Props {
  sessionId: Id;
  roster: ClassRoster;
  heartsFor: (target: SubjectRef) => TeacherHeartActions;
}

/** The teacher's view of the board: every student's hearts by source, with a button to give one. */
export function BoardHeartsGrid({ sessionId, roster, heartsFor }: Props) {
  const rewards = useRewards(sessionId);
  const index = useMemo(() => new RewardIndex(rewards ?? []), [rewards]);
  if (!rewards) return <Loading />;
  return (
    <section className="stack">
      <h2 className="card__title">{t.board.groupsHearts}</h2>
      <div className="grid">
        {roster.groups.map((group) => {
          const members = membersOf(group.id, roster.students);
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
                      <HeartButton owner={student.name} count={tally.total} {...heartsFor({ kind: 'student', id: student.id })} />
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
  );
}
