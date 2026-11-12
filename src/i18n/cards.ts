import { isolate } from './common';
import { ROSTER_PAGE_NAME } from './shell';

/** Text for the printable answer cards page. */
export const cards = {
  title: (className: string) => `بطاقات الإجابة: ${isolate(className)}`,
  noClass: `لا توجد شعب بعد. أضيفي شعبة من صفحة «${ROSTER_PAGE_NAME}».`,
  print: 'طباعة',
  howTo:
    'تحتفظ كل طالبة ببطاقتها. للإجابة ترفع البطاقة بحيث يكون الحرف الذي اختارته في الأعلى، ثم تمسح المعلّمة بطاقات الشعبة بالكاميرا.',
  empty: `لا توجد طالبات بعد. أضيفي طالبات من صفحة «${ROSTER_PAGE_NAME}».`,
  markerLabel: (n: number) => `رمز البطاقة ${n}`,
} as const;
