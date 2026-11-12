import { DEFAULT_YEAR_END, nextClearingDay, type YearEnd } from '../../domain/retention';
import { t } from '../../i18n';
import { useAttempt } from '../common/useAttempt';
import { Checkbox } from '../forms/Checkbox';
import { DayMonthField } from '../forms/DayMonthField';
import { useRetentionSettings } from '../hooks/data';
import { useServices } from '../ServicesContext';

const tr = t.retention;

/** Switches the yearly clearing of the students' data on or off, picks the last day of the school year, and says what that will do. */
export function YearEndTool() {
  const { retention } = useServices();
  const settings = useRetentionSettings();
  const { error, attempt } = useAttempt();
  if (settings === undefined) return null;
  const yearEnd = settings?.yearEnd ?? null;
  const day = settings && nextClearingDay(settings);
  const save = (next: YearEnd | null) => void attempt(() => retention.setYearEnd(next));

  return (
    <div className="stack stack--tight">
      {error && <p className="notice notice--bad">{error}</p>}
      <Checkbox label={tr.yearly.label} checked={yearEnd !== null} onChange={(on) => save(on ? DEFAULT_YEAR_END : null)} />
      {yearEnd === null ? (
        <p className="muted">{tr.yearly.off}</p>
      ) : (
        <>
          <DayMonthField label={tr.yearly.lastDay} value={yearEnd} onChange={save} />
          <p>{tr.yearly.clears}</p>
          <p>{tr.yearly.stays}</p>
          {day && <p><strong>{tr.yearly.next(day)}</strong></p>}
        </>
      )}
    </div>
  );
}
