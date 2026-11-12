import type { Student } from '../../domain/models';
import { t } from '../../i18n';
import { HeartButton } from '../common/HeartButton';

interface PeerHeartsProps {
  targets: readonly Student[];
  heartsOf: (studentId: string) => number;
  onGive: (classmate: Student) => void;
}

/** Collapsible list of classmates a student may encourage with a heart. */
export function PeerHearts({ targets, heartsOf, onGive }: PeerHeartsProps) {
  if (targets.length === 0) return null;
  return (
    <details className="card join__peers">
      <summary className="summary-row">{t.join.encourage}</summary>
      <div className="stack stack--tight">
        <p className="muted">{t.join.encourageHint}</p>
        {targets.map((student) => (
          <div key={student.id} className="row row--between">
            <span>{student.name}</span>
            <HeartButton owner={student.name} count={heartsOf(student.id)} onGive={() => onGive(student)} />
          </div>
        ))}
      </div>
    </details>
  );
}
