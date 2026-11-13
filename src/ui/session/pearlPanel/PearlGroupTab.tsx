import { studentProgress } from '../../../domain/answerProgress';
import { t } from '../../../i18n';
import { HeartButton } from '../../common/HeartButton';
import { PearlString } from '../../common/PearlString';
import { toneStyle } from '../../common/tone';
import { AnswerMarkChip } from './AnswerMarkChip';
import type { PearlGroupProps } from './pearlGroupProps';
import './pearlCards.css';

/** One group's tab: its pearls and heart on top, then all its students in compact rows, each with her mark and her heart. */
export function PearlGroupTab({ entry, pearls, groupHearts, studentHearts, giveTo }: PearlGroupProps) {
  const { group, mark, students } = entry;
  const progress = studentProgress(entry);
  return (
    <section className="card card--tone pearl-card pearl-group" style={toneStyle(group.color)} aria-label={group.name}>
      <header className="pearl-card__head">
        <h3 className="pearl-card__name">{group.name}</h3>
        <div className="pearl-card__pearls">
          <PearlString earned={pearls} />
          {mark && <AnswerMarkChip mark={mark} />}
          {progress.expected > 0 && <span className="muted">{t.common.answeredCount(progress.answered, progress.expected)}</span>}
        </div>
        <HeartButton owner={group.name} count={groupHearts} onGive={giveTo({ kind: 'group', id: group.id })} />
      </header>
      {students.length === 0 ? (
        <p className="muted">{t.board.noStudents}</p>
      ) : (
        <ul className="list-reset pearl-students">
          {students.map(({ student, present, mark: studentMark }) => (
            <li key={student.id} className={present ? 'pearl-student' : 'pearl-student pearl-student--absent'}>
              <span className="pearl-student__name">{student.name}</span>
              {!present && <span className="chip">{t.common.absent}</span>}
              {studentMark && <AnswerMarkChip mark={studentMark} />}
              <HeartButton owner={student.name} count={studentHearts(student.id)} onGive={giveTo({ kind: 'student', id: student.id })} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
