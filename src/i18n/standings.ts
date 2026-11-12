import { common, counted } from './common';
import { ROSTER_PAGE_NAME } from './shell';
import type { OwnStanding } from '../domain/standings';
import { periodDates, type CalendarDate, type Period } from '../domain/periods';

const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const;

const dayAndMonth = ({ day, month }: CalendarDate) => `${day} ${MONTH_NAMES[month - 1]}`;
const monthAndYear = ({ month, year }: CalendarDate) => `${MONTH_NAMES[month - 1]} ${year}`;

/** The name of a period: a month by its name and year, a week by its first and last day, with a year on the first day only when the week spans two. */
function periodLabel(period: Period): string {
  const { first, last } = periodDates(period);
  if (period.kind === 'month') return monthAndYear(first);
  const start = first.year === last.year ? dayAndMonth(first) : `${dayAndMonth(first)} ${first.year}`;
  return `من ${start} إلى ${dayAndMonth(last)} ${last.year}`;
}

const POINTS = { one: 'نقطة واحدة', two: 'نقطتان', few: 'نقاط', many: 'نقطة', hundred: 'نقطة' };
const HEARTS = { one: 'قلب واحد', two: 'قلبان', few: 'قلوب', many: 'قلبًا', hundred: 'قلب' };

export const standings = {
  title: 'النتائج التراكمية',
  periodKind: { week: 'الأسبوع', month: 'الشهر' },
  periodsLabel: 'المدّة',
  previousPeriod: 'المدّة السابقة',
  nextPeriod: 'المدّة التالية',
  noClass: `لا توجد شعبة بعد. أضيفي شعبة من صفحة «${ROSTER_PAGE_NAME}».`,
  toRoster: `الذهاب إلى صفحة «${ROSTER_PAGE_NAME}»`,
  periodLabel,
  classCount: (count: number) => `عدد الحصص المنتهية: ${count}`,
  note: 'تُحسب الحصص التي انتهت فقط. القلوب التي تُعطى بعد الحصة تُحسب أيضًا.',
  empty: 'لا توجد حصص منتهية في هذه المدّة.',
  boardNote: 'مجموع نقاط كل مجموعة وقلوبها في الحصص المنتهية من هذه الشعبة.',
  own: {
    periodKind: { week: 'هذا الأسبوع', month: 'هذا الشهر' },
    line: (label: string, own: OwnStanding) =>
      own.classes === 0
        ? `${label}: لا حصص محسوبة لكِ بعد`
        : `${label}: ${counted(own.points, POINTS)} · ${counted(own.hearts, HEARTS)} · حضرتِ ${common.attendedOf(own.attended, own.classes)}`,
  },
  groups: { title: 'المجموعات', name: 'المجموعة', score: 'النقاط', hearts: 'القلوب' },
  students: { title: 'الطالبات', name: 'الطالبة', attendance: 'الحضور', answered: 'الإجابات', points: 'النقاط', hearts: 'القلوب', unresponsive: 'مرّات عدم التفاعل' },
} as const;
