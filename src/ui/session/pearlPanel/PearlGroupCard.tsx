import type { GroupAnswerStatus } from '../../../domain/answering';
import type { Id, SubjectRef } from '../../../domain/models';
import { t } from '../../../i18n';
import { HeartButton } from '../../common/HeartButton';
import { PearlString } from '../../common/PearlString';
import { toneStyle } from '../../common/tone';
import { AnswerMarkChip } from './AnswerMarkChip';

interface Props {
  entry: GroupAnswerStatus;
  /** The pearls its score has earned, as the board shows them. */
  pearls: number;
  /** The group's total hearts, as the board shows them. */
  groupHearts: number;
  studentHearts: (studentId: Id) => number;
  /** How a heart is given to her or the group; undefined when it may not be. */
  giveTo: (target: SubjectRef) => (() => void) | undefined;
}

/** One group in the panel: its pearls and heart, whether it answered, and its students each with a mark and a heart. */
export function PearlGroupCard({ entry, pearls, groupHearts, studentHearts, giveTo }: Props) {
  const { group, mark, students } = entry;
  return (
    <section className="card card--tone pearl-card" style={toneStyle(group.color)}>
      <header className="pearl-card__head">
        <h3 className="pearl-card__name">{group.name}</h3>
        <HeartButton owner={group.name} count={groupHearts} onGive={giveTo({ kind: 'group', id: group.id })} />
      </header>
      <div className="pearl-card__pearls">
        <PearlString earned={pearls} />
        {mark && <AnswerMarkChip mark={mark} />}
      </div>
      {students.length === 0 ? (
        <p className="muted">{t.board.noStudents}</p>
      ) : (
        <ul className="list-reset pearl-card__students">
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
