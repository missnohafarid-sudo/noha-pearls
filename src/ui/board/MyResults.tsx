import type { ReactNode } from 'react';
import { REWARD_SOURCES, type RewardTally, type StudentReport } from '../../domain/analytics';
import type { Group, Student } from '../../domain/models';
import { t } from '../../i18n';
import { AnswerLabel } from '../common/AnswerLabel';
import { HeartButton } from '../common/HeartButton';
import { VerdictChip } from '../common/VerdictChip';
import { toneStyle } from '../common/tone';
import './board.css';

interface MyResultsProps {
  student: Student;
  group: Group | null;
  report: StudentReport;
  hearts: RewardTally;
  onHide: () => void;
  /** Shown under the points and hearts: her cumulative lines on her own device. */
  children?: ReactNode;
}

/** One student's own results: points, hearts by source, and a row per question. */
export function MyResults({ student, group, report, hearts, onHide, children }: MyResultsProps) {
  return (
    <section className="card card--tone stack" style={group ? toneStyle(group.color) : undefined}>
      <div className="row row--between">
        <h2 className="card__title">{t.board.myResults(student.name)}</h2>
        <button type="button" className="btn btn--small" onClick={onHide}>
          {t.board.hideMine}
        </button>
      </div>
      <div className="row">
        {group && <span className="chip chip--accent">{group.name}</span>}
        <strong>{t.board.myPoints(report.points)}</strong>
        <HeartButton owner={student.name} count={hearts.total} />
        {REWARD_SOURCES.filter((source) => hearts.bySource[source] > 0).map((source) => (
          <span key={source} className="chip">
            {t.common.rewardSource[source]} {hearts.bySource[source]}
          </span>
        ))}
      </div>
      {children}
      <ul className="board__results list-reset">
        {report.results.map((result) => (
          <li key={result.slide.id} className="board__result">
            <strong>{result.slide.title}</strong>
            <span className="board__answer">{result.answer && <AnswerLabel slide={result.slide} answer={result.answer} />}</span>
            <VerdictChip verdict={result.verdict}>{t.board.verdict[result.verdict]}</VerdictChip>
          </li>
        ))}
      </ul>
    </section>
  );
}
