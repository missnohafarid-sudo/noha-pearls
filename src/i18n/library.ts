import { counted, isolate } from './common';

const lessonCount = (n: number) => counted(n, { one: 'درس واحد', two: 'درسان', few: 'دروس', many: 'درسًا', hundred: 'درس' });
const folderCount = (n: number) => counted(n, { one: 'مجلد واحد', two: 'مجلدان', few: 'مجلدات', many: 'مجلدًا', hundred: 'مجلد' });

const rootName = 'الدروس';

const insideText = (folders: number, lessons: number) => [folders > 0 && folderCount(folders), lessons > 0 && lessonCount(lessons)].filter(Boolean).join(' و');

/** Text for the lesson library: the path line, the folder tiles and moving things between folders. */
export const library = {
  rootName,
  pathLabel: 'مكانكِ بين المجلدات',
  emptyFolder: 'هذا المجلد فارغ.',
  /** What a folder tile says it holds: «فارغ» for none, else the lessons counted. */
  holds: (n: number) => (n === 0 ? 'فارغ' : lessonCount(n)),
  /** What a screen reader says for a folder's open button: that it is a folder, its name and what it holds. */
  folderLabel: (name: string, holds: string) => `مجلد ${isolate(name)}، ${holds}`,
  newFolder: 'مجلد جديد',
  newFolderPlaceholder: 'اسم المجلد',
  folderNameLabel: 'اسم المجلد',
  rename: 'إعادة تسمية',
  moveWord: 'نقل',
  renameFolder: (name: string) => `تغيير اسم المجلد ${isolate(name)}`,
  moveFolder: (name: string) => `نقل المجلد ${isolate(name)}`,
  deleteFolder: (name: string) => `حذف المجلد ${isolate(name)}`,
  moveLesson: (title: string) => `نقل الدرس ${isolate(title)}`,
  deleteDialog: {
    withContent: 'حذف ما بداخله أيضًا',
    /** Only the folder goes; what is inside it, if anything, moves up one level. */
    keeps: (folders: number, lessons: number, parentName: string | null) => {
      const inside = insideText(folders, lessons);
      const destination = parentName === null ? `«${rootName}»` : `المجلد ${isolate(parentName)}`;
      return inside ? `سيُحذف المجلد وحده، وما بداخله (${inside}) سينتقل إلى ${destination}.` : 'سيُحذف المجلد.';
    },
    /** The folder goes with everything inside it, at any depth. */
    loses: (folders: number, lessons: number) => `سيُحذف المجلد وكل ما بداخله نهائيًا (${insideText(folders, lessons)})، ولا يمكن التراجع عن ذلك.`,
  },
  select: {
    one: 'تحديد',
    lesson: (title: string) => `تحديد الدرس ${isolate(title)}`,
    all: 'تحديد كل الدروس هنا',
    count: (n: number) => `المحدَّد: ${lessonCount(n)}`,
    /** What the move dialog calls a selection of lessons: the form that follows «نقل». */
    name: (n: number) => counted(n, { one: 'درس واحد', two: 'درسين', few: 'دروس', many: 'درسًا', hundred: 'درس' }),
    publish: 'نشر للزوار',
    unpublish: 'إلغاء النشر',
    deleteConfirm: (n: number) => `سيُحذف ${lessonCount(n)} نهائيًا. اضغطي «تأكيد» للحذف.`,
  },
  move: {
    title: (name: string) => `نقل ${isolate(name)} إلى…`,
    problem: {
      here: 'المكان الحالي',
      'folder-inside-itself': 'لا يمكن وضعه داخل نفسه',
      'folder-missing': 'هذا المجلد لم يعد موجوداً',
    },
  },
  keptIn: (path: string) => `سيُحفظ الدرس الجديد في: ${path}`,
  pathSeparator: ' › ',
} as const;
