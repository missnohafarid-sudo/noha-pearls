import { MAX_CARD_NUMBER, MIN_CARD_NUMBER } from '../domain/cards';
import type { RosterChanges, RosterIssue, RosterIssueCode } from '../domain/rosterFormat';

/** Text for the roster page. */

const ISSUE_TEXT: Record<RosterIssueCode, string> = {
  'wrong-cell-count': 'يجب أن يحتوي السطر على ثلاث خانات بالضبط: رقم البطاقة، ثم الاسم، ثم المجموعة.',
  'bad-card-number': `رقم البطاقة يجب أن يكون عددًا صحيحًا من ${MIN_CARD_NUMBER} إلى ${MAX_CARD_NUMBER}.`,
  'duplicate-card-number': 'رقم البطاقة هذا مكرّر في القائمة.',
  'empty-name': 'الاسم فارغ.',
  'empty-group': 'اسم المجموعة فارغ.',
  'no-students': 'القائمة فارغة: لا توجد فيها أي طالبة.',
};

export function describeRosterIssue(issue: RosterIssue): string {
  return issue.line === null ? ISSUE_TEXT[issue.code] : `السطر ${issue.line}: ${ISSUE_TEXT[issue.code]}`;
}

export function describeRosterChanges(changes: RosterChanges): string {
  return `تمّ استيراد القائمة. الطالبات: أُضيفت ${changes.studentsAdded}، وحُدّثت ${changes.studentsUpdated}، وحُذفت ${changes.studentsRemoved}. المجموعات: أُضيفت ${changes.groupsAdded}، وحُذفت ${changes.groupsRemoved}.`;
}

export const roster = {
  classesLabel: 'الشعب',
  newClass: 'شعبة جديدة',
  defaultClassName: 'شعبة جديدة',
  noClass: 'لا توجد شعب بعد. أضيفي شعبة جديدة لتبدئي.',
  classNotFound: 'لا توجد شعبة بهذا الرابط. اختاري شعبة من القائمة.',
  panelClass: 'الشعبة',
  deleteClass: 'حذف الشعبة مع مجموعاتها وطالباتها',
  openCards: 'طباعة بطاقات الإجابة',
  addStudent: 'إضافة طالبة',
  addGroup: 'إضافة مجموعة',
  defaultGroupName: 'مجموعة جديدة',
  defaultStudentName: 'طالبة جديدة',
  noStudents: 'لا توجد طالبات في هذه المجموعة.',
  cardNumber: (n: number) => `بطاقة ${n}`,
  panelGroups: 'المجموعات',
  panelEdit: 'تعديل',
  pickHint: 'اختاري مجموعة أو طالبة من القائمة لتعديلها.',
  deleteGroup: 'حذف المجموعة',
  deleteStudent: 'حذف الطالبة',
  /** Same order as GROUP_COLORS. */
  colorNames: ['وردي', 'فيروزي', 'بنفسجي', 'ذهبي', 'أزرق', 'زيتوني'],
  describeIssue: describeRosterIssue,
  describeChanges: describeRosterChanges,
  import: {
    title: 'استيراد قائمة هذه الشعبة',
    help1: 'انسخي من إكسل الأعمدة الثلاثة: رقم البطاقة، ثم الاسم، ثم المجموعة، والصقيها هنا، أو اختاري ملفًا نصيًا.',
    help2: 'رقم الطالبة هو الرقم المطبوع على بطاقتها، فتبقى البطاقات المطبوعة صالحة كما هي.',
    exampleLabel: 'مثال:',
    exampleLines: ['1 | سلمى أحمد | المجموعة الأولى', '2 | نور خالد | المجموعة الأولى', '3 | ريم يوسف | المجموعة الثانية'],
    pasteLabel: 'قائمة الشعبة',
    orFile: 'أو من ملف (.txt أو .csv أو .tsv):',
    fileReadError: 'تعذّرت قراءة الملف. جرّبي ملفًا آخر أو الصقي القائمة هنا.',
    addButton: 'إضافة إلى القائمة',
    replaceButton: 'استبدال القائمة كلها',
    replaceHelp: 'الاستبدال يحذف الطالبات غير الموجودات في القائمة الملصقة.',
    errorsTitle: 'لم يتغيّر شيء. صحّحي الأسطر الآتية ثم حاولي مرة أخرى:',
    exportButton: 'تصدير القائمة',
    exportFile: 'قائمة الشعبة.txt',
    /** A comment line on top of the exported file; the same three columns, tab-separated. */
    fileHeader: 'رقم البطاقة\tالاسم\tالمجموعة',
  },
  fields: {
    name: 'الاسم',
    color: 'اللون',
    cardNumber: 'رقم البطاقة',
    group: 'المجموعة',
  },
  errors: {
    'group-not-empty': 'لا يمكن حذف مجموعة فيها طالبات. انقلي الطالبات أو احذفيهنّ أولًا.',
    'card-number-taken': 'رقم البطاقة مستخدم في هذه الشعبة أو غير صالح. اختاري رقمًا آخر.',
    'group-missing': 'لم نجد هذه المجموعة. حدّثي الصفحة وحاولي مرة أخرى.',
    'class-in-use': 'لا يمكن حذف شعبة عندها حصة جارية. أنهي الحصة أولًا.',
    'class-missing': 'لم نجد هذه الشعبة. حدّثي الصفحة وحاولي مرة أخرى.',
    'name-blank': 'الاسم فارغ. اكتبي اسمًا.',
    'teacher-in-use': 'لا يمكن حذف معلّمة عندها حصة جارية. أنهي حصتها أولًا.',
    unknown: 'تعذّر تنفيذ العملية. حاولي مرة أخرى.',
  },
} as const;
