import { useCallback, useState } from 'react';
import type { Session, SubjectRef } from '../../domain/models';
import { pearlsEarned, rankScores } from '../../domain/scoring';
import { t } from '../../i18n';
import pearlsRow from '../assets/brand/pearls-row.jpg';
import { HeartButton } from '../common/HeartButton';
import { Loading } from '../common/PageState';
import { PearlString } from '../common/PearlString';
import { toneStyle } from '../common/tone';
import { useAdmin, useSessionRoster } from '../hooks/data';
import { useBoardTotals, useCardResults } from '../hooks/byCode';
import { useTeacherHearts } from '../hooks/useTeacherHearts';
import { BoardCodeEntry } from '../board/BoardCodeEntry';
import { CardProbe } from '../board/CardProbe';
import { BoardHeartsGrid } from '../board/BoardHeartsGrid';
import { MyResults } from '../board/MyResults';
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
  const admin = useAdmin();
  const session = useShownSession('board', code);
  if (session === undefined) return <Loading />;
  if (session === null) {
    return (
      <div className="page">
        {banner}
        <h1 className="page__title">{t.shell.nav.board}</h1>
        {admin ? <SessionChooser page="board" code={code} empty={<p className="notice">{t.board.empty}</p>} /> : <BoardCodeEntry code={code} />}
      </div>
    );
  }
  return <BoardView session={session} />;
}

function BoardView({ session }: { session: Session }) {
  const admin = useAdmin();
  const totals = useBoardTotals(session.code);
  const roster = useSessionRoster(session);
  const [card, setCard] = useState<number | null>(null);
  const [reads, setReads] = useState<number[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const results = useCardResults(session.code, card);
  const noteRead = useCallback((read: number) => setReads((now) => (now.includes(read) ? now : [...now, read])), []);
  const showCard = useCallback((found: number) => setCard((now) => now ?? found), []);
  const heartFor = useTeacherHearts(session);

  if (!totals) return <Loading />;

  const heartsFor = (target: SubjectRef) => (roster ? heartFor(roster, target) : {});
  const ranked = rankScores(totals);

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
          {ranked.map((total) => {
            const { group, rank, score, max, hearts } = total;
            return (
              <li key={group.id} className="card board__rank" style={toneStyle(group.color)}>
                <span className="board__position">{rank}</span>
                <div className="stack stack--tight board__rank-main">
                  <strong>{group.name}</strong>
                  <PearlString earned={pearlsEarned(total)} />
                </div>
                <span className="muted">{t.common.scoreOf(score, max)}</span>
                <HeartButton owner={group.name} count={hearts} {...heartsFor({ kind: 'group', id: group.id })} />
              </li>
            );
          })}
        </ol>
      </section>

      <GroupStandingsOfClass session={session} />

      {admin ? (
        roster && <BoardHeartsGrid sessionId={session.id} roster={roster} heartsFor={heartsFor} />
      ) : (
        <section className="stack">
          {results ? (
            <MyResults student={results} group={results.group} report={results.report} hearts={results.hearts} onHide={() => {
                setCard(null);
                setReads([]);
                setIdentifying(false);
              }} />
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
      {identifying && !results && (
        <CardIdentify onCard={noteRead} onClose={() => setIdentifying(false)} />
      )}
      {card === null && reads.map((read) => <CardProbe key={read} code={session.code} card={read} onFound={showCard} />)}

      <AdminPanel title={t.board.panelTitle}>
        <p className="muted">{t.board.panelBody}</p>
      </AdminPanel>
    </div>
  );
}
