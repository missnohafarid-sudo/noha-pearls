import { counted, type CountForms } from './common';
import { fullDate } from './months';
import { standings } from './standings';
import type { CalendarDate } from '../domain/periods';

const CLASSES: CountForms = { one: 'حصة واحدة', two: 'حصتان', few: 'حصص', many: 'حصة', hundred: 'حصة' };

/** Keeping and clearing class data: deleting the students' data at the end of the school year, and deleting ended classes between two dates. */
export const retention = {
  title: 'العام الدراسي',
  yearly: {
    label: 'حذف بيانات الطالبات تلقائيًا بعد آخر يوم في العام الدراسي',
    lastDay: 'آخر يوم في العام الدراسي',
    off: 'لن تُحذف بيانات الطالبات تلقائيًا.',
    clears: 'عند نهاية العام الدراسي يُحذف: قوائم الشعب والمجموعات والطالبات، وكل الحصص حتى الجارية، بإجاباتها وقلوبها ونتائجها.',
    stays: 'ويبقى: الدروس والمجلدات والمعلّمات ومحتوى الصفحة الرئيسية.',
    next: (day: CalendarDate) => `ستُحذف بيانات الطالبات في نهاية يوم ${fullDate(day)}.`,
  },
  notice: (day: CalendarDate) => `ستُحذف بيانات الطالبات في نهاية يوم ${fullDate(day)}، وهو آخر يوم في العام الدراسي. لتغيير التاريخ افتحي صفحة «${standings.title}».`,
  done: (day: CalendarDate) => `حُذفت بيانات الطالبات يوم ${fullDate(day)} مع نهاية العام الدراسي.`,
  toResults: `فتح صفحة «${standings.title}»`,
  range: {
    title: (className: string) => `حذف الحصص المنتهية لـ«${className}» بين تاريخين`,
    from: 'من تاريخ',
    to: 'إلى تاريخ',
    badOrder: 'تاريخ البداية بعد تاريخ النهاية. غيّري أحد التاريخين.',
    found: (className: string, count: number) => `الحصص المنتهية لـ«${className}» بين التاريخين: ${counted(count, CLASSES)}`,
    none: (className: string) => `لا توجد حصص منتهية لـ«${className}» بين هذين التاريخين.`,
    runningStay: 'الحصص الجارية لا تُحسب ولا تُحذف.',
    remove: 'حذف الحصص المنتهية',
    consequence: (className: string, count: number, from: CalendarDate, to: CalendarDate) =>
      `سيُحذف ${counted(count, CLASSES)} من «${className}» من ${fullDate(from)} إلى ${fullDate(to)}، بإجاباتها وقلوبها ونتائجها. لا يمكن التراجع.`,
    removed: (count: number) => `تم حذف ${counted(count, CLASSES)}.`,
  },
  errors: {
    'bad-range': 'التاريخان غير صحيحين. اختاري تاريخين صحيحين.',
    'bad-year-end': 'هذا اليوم غير موجود في الشهر. اختاري يومًا آخر.',
  },
} as const;
