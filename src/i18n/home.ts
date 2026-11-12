import { listed } from './common';

/** "The teacher" in the singular, the dual and the plural. */
const TEACHERS_LABEL = ['المعلّمة', 'المعلّمتان', 'المعلّمات'] as const;

/** Text for the home page. */
export const home = {
  liveNowVisitor: 'هناك حصة مباشرة الآن. للانضمام امسحي رمز QR الخاص بمجموعتكِ، أو اكتبي رمز الحصة.',
  join: {
    submit: 'انضمام',
    ended: 'انتهت هذه الحصة.',
    wrongCode: 'هذا الرمز غير صحيح. اطلبي رمز الحصة من المعلّمة.',
    chooseGroup: 'اختاري مجموعتكِ',
  },
  lessonsTitle: 'الدروس',
  noLessons: 'لا توجد دروس بعد.',
  unpublished: 'غير منشور',
  questionCount: (n: number) => `${n} سؤال`,
  panel: {
    site: 'محتوى الصفحة الرئيسية',
    lessons: 'الدروس',
    newLesson: 'درس جديد',
    newLessonTitle: 'درس جديد',
    importLesson: 'استيراد درس',
  },
  /** The teachers' line under the introduction: the label agrees with how many names follow; nothing when there are none. */
  teachersLine: (names: readonly string[]) => (names.length === 0 ? '' : `${TEACHERS_LABEL[Math.min(names.length, 3) - 1]}: ${listed(names)}`),
  siteField: {
    schoolName: 'اسم المدرسة',
    title: 'العنوان',
    tagline: 'العبارة التعريفية',
    intro: 'مقدمة',
  },
} as const;
