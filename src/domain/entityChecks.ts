import { importLesson, exportLesson } from './lessonFormat';
import { integer, isBoolean, isId, isName, isRecord, MAX_SLIDES_PER_LESSON, MAX_TITLE_LENGTH, nonEmptyText, number, shape, text, listOf, nullable, oneOf, type Check } from './argumentChecks';

/** The shapes of the whole objects a method takes: the site's text, a group, a student, a lesson. */

export const isSiteContent: Check = shape({ id: oneOf('site'), schoolName: text(MAX_TITLE_LENGTH), title: text(MAX_TITLE_LENGTH), tagline: text(MAX_TITLE_LENGTH), intro: text(MAX_TITLE_LENGTH) });
export const isGroup: Check = shape({ id: isId, classId: isId, name: isName, color: text(20), order: number(-1e9, 1e9) });
export const isStudent: Check = shape({ id: isId, cardNumber: integer(1, 999), name: isName, groupId: isId });
export const isSubject: Check = shape({ kind: oneOf('student', 'group'), id: isId });
export const isImportMode: Check = oneOf('merge', 'replace');

const isDay = shape({ year: integer(1900, 2200), month: integer(1, 12), day: integer(1, 31) });
export const isDateRange: Check = shape({ from: isDay, to: isDay });
export const isYearEnd: Check = nullable(shape({ month: integer(1, 12), day: integer(1, 31) }));

/** A lesson as the teacher saves it: it must be one the lesson file would accept, so a lesson is held to the file's rules when saved and not only when imported. */
export const isLesson: Check = (value) => {
  if (!shape({ id: isId, folderId: nullable(isId), title: nonEmptyText(MAX_TITLE_LENGTH), subject: text(MAX_TITLE_LENGTH), grade: text(MAX_TITLE_LENGTH), published: isBoolean, slides: listOf(isRecord, MAX_SLIDES_PER_LESSON), updatedAt: number(0, 8.64e15) })(value)) return false;
  try {
    const lesson = value as Parameters<typeof exportLesson>[0];
    const read = importLesson(exportLesson(lesson));
    return read.ok && read.lesson.slides.length === lesson.slides.length && new Set(lesson.slides.map((slide) => slide.id)).size === lesson.slides.length && lesson.slides.every((slide) => isId(slide.id));
  } catch {
    return false;
  }
};
