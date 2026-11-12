import { counted, isolate } from './common';

const lessonCount = (n: number) => counted(n, { one: 'درس واحد', two: 'درسان', few: 'دروس', many: 'درسًا', hundred: 'درس' });
const folderCount = (n: number) => counted(n, { one: 'مجلد واحد', two: 'مجلدان', few: 'مجلدات', many: 'مجلدًا', hundred: 'مجلد' });

const rootName = 'الدروس';

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
  /** What pressing «حذف» twice does: only the folder goes, and what is inside it, if anything, moves up one level. */
  deleteConfirm: (folders: number, lessons: number, parentName: string | null) => {
    const inside = [folders > 0 && folderCount(folders), lessons > 0 && lessonCount(lessons)].filter(Boolean).join(' و');
    const destination = parentName === null ? `«${rootName}»` : `المجلد ${isolate(parentName)}`;
    return `${inside ? `سيُحذف المجلد وحده، وما بداخله (${inside}) سينتقل إلى ${destination}.` : 'سيُحذف المجلد.'} اضغطي «تأكيد» للحذف.`;
  },
  move: {
    title: (name: string) => `نقل ${isolate(name)} إلى…`,
    problem: {
      here: 'هو هنا الآن',
      'folder-inside-itself': 'لا يمكن وضعه داخل نفسه',
      'folder-missing': 'هذا المجلد لم يعد موجوداً',
    },
  },
  keptIn: (path: string) => `سيُحفظ الدرس الجديد في: ${path}`,
  pathSeparator: ' › ',
} as const;
