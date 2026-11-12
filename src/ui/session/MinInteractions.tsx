import { t } from '../../i18n';
import { Stepper } from '../forms/Stepper';

interface Props {
  value: number;
  /** The most the minimum can be: the questions that count. */
  max: number;
  /** Absent when the class takes no more changes: the number is then only shown. */
  onChange?: (value: number) => void;
}

/** The session's minimum of interactions, with minus and plus while the class takes changes, and what it means. */
export function MinInteractions({ value, max, onChange }: Props) {
  return (
    <div className="stack stack--tight">
      <span className="row">
        <span className="muted">{t.monitor.minInteractions}</span>
        {onChange ? (
          <Stepper label={t.monitor.minInteractions} decreaseLabel={t.monitor.lowerMin} increaseLabel={t.monitor.raiseMin} min={0} max={max} value={value} onChange={onChange} />
        ) : (
          <strong>{value}</strong>
        )}
      </span>
      <p className="muted">{t.monitor.minInteractionsHint}</p>
    </div>
  );
}
