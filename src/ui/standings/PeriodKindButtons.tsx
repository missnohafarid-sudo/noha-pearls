import { PERIOD_KINDS, type PeriodKind } from '../../domain/periods';
import { t } from '../../i18n';

const ts = t.standings;

/** The two buttons that choose between the week and the month. */
export function PeriodKindButtons({ kind, onKind }: { kind: PeriodKind; onKind: (kind: PeriodKind) => void }) {
  return (
    <div className="row" role="group" aria-label={ts.periodsLabel}>
      {PERIOD_KINDS.map((option) => (
        <button key={option} type="button" className="btn btn--small" aria-pressed={option === kind} onClick={() => onKind(option)}>
          {ts.periodKind[option]}
        </button>
      ))}
    </div>
  );
}
