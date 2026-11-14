import type { PearlShade } from '../domain/pearlShades';

const ofTotal = (part: number, total: number) => `${part} من ${total}`;

/** Words shared by more than one page. Page-specific text lives in that page's own file. */
export const common = {
  crashed: 'حدث خطأ ما. أعيدي تحميل الصفحة.',
  reload: 'إعادة تحميل الصفحة',
  loading: 'جارٍ التحميل…',
  cancel: 'إلغاء',
  close: 'إغلاق',
  remove: 'حذف',
  add: 'إضافة',
  pearlShade: {
    white: 'أبيض لؤلؤي',
    cream: 'كريمي',
    pink: 'وردي',
    gold: 'ذهبي',
    purple: 'بنفسجي',
    brown: 'برونزي',
    black: 'أسود',
  } satisfies Record<PearlShade, string>,
  confirm: 'تأكيد',
  copied: 'تم النسخ',
  previous: 'السابق',
  next: 'التالي',
  chooseFile: 'اختيار ملف',
  noFile: 'لم يُختر ملف',
  showPassword: 'إظهار كلمة المرور',
  hidePassword: 'إخفاء كلمة المرور',
  decrease: 'إنقاص',
  increase: 'زيادة',
  hearts: 'قلوب',
  /** The one name of an answer a group's shared device gave: to the teacher, and to the student it counts for. */
  groupAnswer: 'إجابة المجموعة',
  yourGroupAnswer: 'إجابة مجموعتكِ',
  /** What a screen reader says for a heart count: whose hearts, then how many. */
  heartsOf: (owner: string, count: number) => `قلوب ${isolate(owner)}: ${count}`,
  sessionLive: 'الحصة جارية',
  sessionEnded: 'انتهت الحصة',
  notFoundTitle: 'الصفحة غير موجودة',
  notFoundBody: 'تحقّقي من الرابط، أو عودي إلى الصفحة الرئيسية.',
  backHome: 'العودة إلى الرئيسية',
  present: 'حاضرة',
  absent: 'غائبة',
  unresponsive: 'غير متفاعلة',
  answeredCount: (answered: number, total: number) => `أجابت ${answered} من ${total}`,
  slideOf: ofTotal,
  slideCount: (count: number) => `${count} شريحة`,
  pearlsOf: (earned: number, total: number) => `${earned} من ${total} لؤلؤات`,
  scoreOf: ofTotal,
  attendedOf: ofTotal,
  interactionsOf: ofTotal,
  /** "subject · grade", skipping whichever is empty. */
  subjectGrade: (subject: string, grade: string) => [subject, grade].filter(Boolean).join(' · '),
  date: {
    day: 'اليوم',
    month: 'الشهر',
    year: 'السنة',
    /** What a screen reader says for one part of a date: whose date, then which part. */
    part: (group: string, part: string) => `${group}: ${part}`,
  },
  /** What names a choice option that is a picture, where only words fit (the monitor, the results, the correct-answer list). */
  pictureOption: 'صورة',
  fullscreen: 'ملء الشاشة',
  exitFullscreen: 'إنهاء ملء الشاشة',
  scope: {
    individual: 'فردي: كل طالبة تجيب',
    group: 'جماعي: إجابة واحدة للمجموعة',
  },
  /** The teacher's button that takes one heart away; `owner` is a student's or a group's name. */
  takeHeartFrom: (owner: string) => `سحب قلب من ${isolate(owner)}`,
  /** The chip beside the per-source ones: how many hearts the teacher took back. */
  heartsTaken: 'سُحبت',
  rewardSource: {
    teacher: 'المعلّمة',
    peer: 'الزميلات',
    guest: 'الضيوف',
    supervisor: 'التوجيه التربوي',
  },
} as const;

/** A name or code put into a sentence: isolated, so digits and hyphens in "11-4" keep their order inside right-to-left text. */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`;
}

/** The forms of a counted noun: for exactly one and two (which carry the number in the word), for 3 to 10, for 11 to 99, and for 100 and above. */
export interface CountForms {
  one: string;
  two: string;
  few: string;
  many: string;
  hundred: string;
}

/** A count with its noun as Arabic says it: "نقطة واحدة"، "نقطتان"، "5 نقاط"، "12 نقطة"، "100 نقطة". */
export function counted(count: number, forms: CountForms): string {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  if (Number.isInteger(count) && count >= 100) return `${count} ${forms.hundred}`;
  return Number.isInteger(count) && count <= 10 ? `${count} ${forms.few}` : `${count} ${forms.many}`;
}

/** Names in a sentence as Arabic lists them, each one isolated: "أ وب" for two, "أ، ب وج" for more. */
export function listed(names: readonly string[]): string {
  const isolated = names.map(isolate);
  if (isolated.length < 2) return isolated.join('');
  return `${isolated.slice(0, -1).join('، ')} و${isolated[isolated.length - 1]}`;
}

/** The option letters, one per possible choice. */
export const CHOICE_LETTERS = ['أ', 'ب', 'ج', 'د'] as const;

export function choiceLetter(index: number): string {
  return CHOICE_LETTERS[index] ?? '?';
}
