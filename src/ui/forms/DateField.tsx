import { useId } from 'react';
import { clampToMonth, daysInMonth, type CalendarDate } from '../../domain/periods';
import { t } from '../../i18n';
import { MONTH_NAMES } from '../../i18n/months';
import { Select } from './Select';

/** The years a full date offers; without it the field is a day and a month only. */
interface YearRange {
  first: number;
  last: number;
}

interface DateFieldProps {
  value: CalendarDate;
  onChange: (date: CalendarDate) => void;
  /** Shown above the field, and the start of each drop-down's name for a screen reader. */
  label: string;
  years?: YearRange;
}

const numbers = (first: number, count: number) => Array.from({ length: count }, (_, index) => String(first + index));
const asOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));
const MONTHS = MONTH_NAMES.map((name, index) => ({ value: String(index + 1), label: name }));

/** Our own date control: the day, the month by its name and, when `years` is given, the year, each a drop-down. The days offered are the days the chosen month has that year. */
export function DateField({ value, onChange, label, years }: DateFieldProps) {
  const labelId = useId();
  const part = (name: string) => t.common.date.part(label, name);
  const change = (next: Partial<CalendarDate>) => onChange(clampToMonth({ ...value, ...next }));

  return (
    <div className="field">
      <span id={labelId} className="field__label">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} className="date-field">
        <Select
          aria-label={part(t.common.date.day)}
          options={asOptions(numbers(1, daysInMonth(value.year, value.month)))}
          value={String(value.day)}
          onChange={(day) => change({ day: Number(day) })}
        />
        <Select aria-label={part(t.common.date.month)} options={MONTHS} value={String(value.month)} onChange={(month) => change({ month: Number(month) })} />
        {years && (
          <Select
            aria-label={part(t.common.date.year)}
            options={asOptions(numbers(years.first, years.last - years.first + 1))}
            value={String(value.year)}
            onChange={(year) => change({ year: Number(year) })}
          />
        )}
      </div>
    </div>
  );
}
