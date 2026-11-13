import { importLesson } from '../domain/lessonFormat';
import type { Group, SchoolClass, SiteContent, Student, Teacher } from '../domain/models';
import { GROUP_COLORS } from '../domain/roster';
import type { DocumentStore } from '../ports/store';
import sampleLesson from '../domain/sampleLesson.json';

/** Sample data so a fresh install has something to click through. Invented names only. */

const SITE: SiteContent = {
  id: 'site',
  schoolName: 'مدرسة النموذج الثانوية',
  title: 'لؤلؤات لأولي النهى',
  tagline: "Noha's Pearls",
  intro: 'دروس تفاعلية تقودها المعلّمة: تعرض الشرائح، وتطرح الأسئلة، وتجيب المجموعات من أجهزتها أو ببطاقات الإجابة.',
};

const CLASS: SchoolClass = { id: 'c1', name: 'شعبة تجريبية', order: 1 };

const TEACHER: Teacher = { id: 't1', name: 'أ. المعلّمة', order: 1 };

const GROUP_NAMES = ['المجموعة الأولى', 'المجموعة الثانية', 'المجموعة الثالثة', 'المجموعة الرابعة'];

const STUDENT_NAMES = [
  'سلمى أحمد', 'نور خالد', 'ريم يوسف', 'هند سالم', 'دانة علي', 'لمى حسن',
  'جود عمر', 'شهد ماجد', 'ميار سعيد', 'تالا فهد', 'غلا ناصر', 'رزان هادي',
];

/**
 * Fills an empty store: the site's default wording and an example lesson the teacher may delete, always. The sample school
 * (a class list, a teacher, groups and students) only when asked: the browser-only mode and a hub on this computer ask, a school's hub does not.
 */
export async function seedIfEmpty(store: DocumentStore, withSampleSchool: boolean): Promise<void> {
  if (await store.get('site', SITE.id)) return;
  if (withSampleSchool) await putSampleSchool(store);

  const imported = importLesson(JSON.stringify(sampleLesson));
  if (imported.ok) await store.put('lessons', { ...imported.lesson, published: true });

  // Written last: its presence marks the seed as complete.
  await store.put('site', SITE);
}

async function putSampleSchool(store: DocumentStore): Promise<void> {
  const groups: Group[] = GROUP_NAMES.map((name, i) => ({ id: `g${i + 1}`, classId: CLASS.id, name, color: GROUP_COLORS[i], order: i + 1 }));
  const students: Student[] = STUDENT_NAMES.map((name, i) => ({
    id: `s${i + 1}`,
    name,
    cardNumber: i + 1,
    groupId: groups[i % groups.length].id,
  }));

  await store.put('classes', CLASS);
  await store.put('teachers', TEACHER);
  for (const group of groups) await store.put('groups', group);
  for (const student of students) await store.put('students', student);
}
