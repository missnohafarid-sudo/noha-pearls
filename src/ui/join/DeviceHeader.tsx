import type { Group } from '../../domain/models';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { HeartButton } from '../common/HeartButton';
import { PearlString } from '../common/PearlString';
import { toneStyle } from '../common/tone';

interface DeviceHeaderProps {
  group: Group;
  /** The pearls the group has earned from revealed answers. */
  pearls: number;
  /** The named student this device belongs to; null on a shared group device, which has no hearts or results. */
  /** Offered on a shared device only: it gives the seat up so the girl holding it can pick her name. */
  onChooseName: () => void;
  student: { name: string; hearts: number; resultsShown: boolean; onToggleResults: () => void } | null;
}

/** Group-tinted top bar: who this device is and, for a named student, her hearts and results. */
export function DeviceHeader({ group, pearls, student, onChooseName }: DeviceHeaderProps) {
  return (
    <header className="card card--tone join__header" style={toneStyle(group.color)}>
      <div className="stack stack--tight">
        <strong>{group.name}</strong>
        <span className="muted">{student?.name ?? t.join.sharedDeviceLabel}</span>
        <PearlString earned={pearls} />
      </div>
      {student ? (
        <div className="row">
          <HeartButton owner={student.name} count={student.hearts} />
          <button type="button" className="btn btn--small" aria-pressed={student.resultsShown} onClick={student.onToggleResults}>
            {t.join.myResults}
          </button>
        </div>
      ) : (
        <ConfirmButton className="btn btn--small" onConfirm={onChooseName}>
          {t.join.pickName}
        </ConfirmButton>
      )}
    </header>
  );
}
