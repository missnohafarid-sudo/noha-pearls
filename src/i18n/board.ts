import { isolate } from './common';

/** Text for the reinforcement board. */
export const board = {
  empty: 'لم تبدأ أي حصة بعد.',
  showBoard: 'عرض اللوحة',
  codePrompt: 'اكتبي رمز الحصة لتري لوحة التعزيز.',
  leaderboard: 'ترتيب المجموعات',
  groupsHearts: 'قلوب الطالبات',
  noStudents: 'لا توجد طالبات في هذه المجموعة.',
  panelTitle: 'منح القلوب',
  panelBody:
    'تمنح المعلّمة القلوب هنا وفي صفحة المتابعة. وتمنح الطالبات قلوبًا لزميلاتهنّ في المجموعات الأخرى من أجهزتهنّ. يرى الزوّار مجاميع المجموعات فقط، وترى كل طالبة نتائجها على جهازها، أو هنا حين تُظهر بطاقة إجابتها للكاميرا.',
  showMine: 'أظهري بطاقتي لأرى نتائجي',
  showMineHint: 'يرى الزوّار مجاميع المجموعات فقط. نتائجكِ الشخصية تظهر على جهازكِ في الحصة، أو هنا حين تُظهرين بطاقة إجابتكِ للكاميرا.',
  hideMine: 'إخفاء نتائجي',
  myResults: (name: string) => `نتائج ${isolate(name)}`,
  myPoints: (points: number) => `نقاطكِ: ${points}`,
  verdict: {
    correct: 'صحيحة',
    wrong: 'خاطئة',
    recorded: 'سُجّلت',
    pending: 'بانتظار كشف المعلّمة',
    none: '—',
  },
} as const;
