import type { CalendarDate } from '../domain/periods';

/** The names of the twelve months, and dates written with them: the one home of how a date reads. */
export const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const;

/** The name of a month numbered 1 to 12. */
export const monthName = (month: number): string => MONTH_NAMES[month - 1];

export const dayAndMonth = ({ day, month }: Pick<CalendarDate, 'day' | 'month'>) => `${day} ${monthName(month)}`;
export const monthAndYear = ({ month, year }: Pick<CalendarDate, 'month' | 'year'>) => `${monthName(month)} ${year}`;
export const fullDate = (date: CalendarDate) => `${dayAndMonth(date)} ${date.year}`;
