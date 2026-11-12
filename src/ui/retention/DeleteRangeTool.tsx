import { useEffect, useRef, useState } from 'react';
import type { Id, SchoolClass } from '../../domain/models';
import type { CalendarDate } from '../../domain/periods';
import { isValidRange, rangeYears } from '../../domain/retention';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { useAttempt } from '../common/useAttempt';
import { DateField } from '../forms/DateField';
import { useAsked } from '../hooks/data';
import { useServices } from '../ServicesContext';

const tr = t.retention.range;

/** Deletes the ended classes of one class list between two dates: shows how many there are before, and asks again before deleting exactly those. */
export function DeleteRangeTool({ schoolClass }: { schoolClass: SchoolClass }) {
  const { retention } = useServices();
  const limits = useAsked(() => retention.rangeLimits(), [retention]);
  return limits ? <RangeChoice schoolClass={schoolClass} today={limits.today} /> : null;
}

function RangeChoice({ schoolClass, today }: { schoolClass: SchoolClass; today: CalendarDate }) {
  const { retention } = useServices();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [version, setVersion] = useState(0);
  const [removed, setRemoved] = useState<{ count: number } | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const { error, attemptWith } = useAttempt();
  const years = rangeYears(today);
  const valid = isValidRange({ from, to });
  const classId: Id = schoolClass.id;
  const query = JSON.stringify([classId, from, to, version]);
  const asked = useAsked(valid ? async () => ({ query, ids: await retention.classesToRemove(classId, { from, to }) }) : null, [retention, classId, valid, from, to, version]);
  const ids = asked?.query === query ? asked.ids : undefined;

  useEffect(() => {
    if (removed) status.current?.focus();
  }, [removed]);

  const choose = (set: (date: CalendarDate) => void) => (date: CalendarDate) => {
    set(date);
    setRemoved(null);
  };
  const remove = async (confirmed: readonly Id[]) => {
    const done = await attemptWith(() => retention.removeClasses(classId, { from, to }, confirmed));
    if (!done) return;
    setRemoved({ count: done.value });
    setVersion((current) => current + 1);
  };

  return (
    <div className="stack stack--tight">
      <h3 className="retention__subtitle">{tr.title(schoolClass.name)}</h3>
      {error && <p className="notice notice--bad">{error}</p>}
      <DateField label={tr.from} value={from} onChange={choose(setFrom)} years={years} />
      <DateField label={tr.to} value={to} onChange={choose(setTo)} years={years} />
      {valid ? ids !== undefined && <p>{ids.length === 0 ? tr.none(schoolClass.name) : tr.found(schoolClass.name, ids.length)}</p> : <p className="notice notice--bad">{tr.badOrder}</p>}
      <p className="muted">{tr.runningStay}</p>
      {valid && ids !== undefined && ids.length > 0 && (
        <div>
          <ConfirmButton key={JSON.stringify([classId, from, to, ids])} onConfirm={() => void remove(ids)} consequence={tr.consequence(schoolClass.name, ids.length, from, to)}>
            {tr.remove}
          </ConfirmButton>
        </div>
      )}
      <p ref={status} role="status" tabIndex={-1} className={removed ? 'notice' : undefined}>
        {removed ? tr.removed(removed.count) : ''}
      </p>
    </div>
  );
}
