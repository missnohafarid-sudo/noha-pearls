import { LEAP_YEAR, type YearEnd } from '../../domain/retention';
import { DateField } from './DateField';

interface DayMonthFieldProps {
  value: YearEnd;
  onChange: (value: YearEnd) => void;
  label: string;
}

/** A day and a month that repeat every year: the full date field without its year, on a leap year so that 29 February can be chosen. */
export function DayMonthField({ value, onChange, label }: DayMonthFieldProps) {
  return <DateField label={label} value={{ year: LEAP_YEAR, ...value }} onChange={({ month, day }) => onChange({ month, day })} />;
}
