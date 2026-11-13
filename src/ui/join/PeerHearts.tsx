import type { Classmate } from '../../domain/visibility';
import { t } from '../../i18n';
import { HeartButton } from '../common/HeartButton';

interface PeerHeartsProps {
  classmates: readonly Classmate[];
  onGive: (classmate: Classmate) => void;
}

/** Collapsible list of classmates a student may encourage with a heart. */
export function PeerHearts({ classmates, onGive }: PeerHeartsProps) {
  if (classmates.length === 0) return null;
  return (
    <details className="card join__peers">
      <summary className="summary-row">{t.join.encourage}</summary>
      <div className="stack stack--tight">
        <p className="muted">{t.join.encourageHint}</p>
        {classmates.map((classmate) => (
          <div key={classmate.id} className="row row--between">
            <span>{classmate.name}</span>
            <HeartButton owner={classmate.name} count={classmate.hearts} onGive={() => onGive(classmate)} />
          </div>
        ))}
      </div>
    </details>
  );
}
