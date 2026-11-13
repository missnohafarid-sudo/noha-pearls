import { integer, isBoolean, isId, isName, isRecord, MAX_SLIDES_PER_LESSON, MAX_TITLE_LENGTH, number, shape, text, listOf, nullable, oneOf, type Check } from './argumentChecks';
import { isSlideKind } from './slideKinds';

/** The shapes of the whole objects a method takes: the site's text, a group, a student, a lesson. */

export const isSiteContent: Check = shape({ id: oneOf('site'), schoolName: text(MAX_TITLE_LENGTH), title: text(MAX_TITLE_LENGTH), tagline: text(MAX_TITLE_LENGTH), intro: text(MAX_TITLE_LENGTH) });
export const isGroup: Check = shape({ id: isId, classId: isId, name: isName, color: text(20), order: number(-1e9, 1e9) });
export const isStudent: Check = shape({ id: isId, cardNumber: integer(1, 999), name: isName, groupId: isId });
export const isSubject: Check = shape({ kind: oneOf('student', 'group'), id: isId });
export const isImportMode: Check = oneOf('merge', 'replace');

const isDay = shape({ year: integer(1900, 2200), month: integer(1, 12), day: integer(1, 31) });
export const isDateRange: Check = shape({ from: isDay, to: isDay });
export const isYearEnd: Check = nullable(shape({ month: integer(1, 12), day: integer(1, 31) }));

const isSlide: Check = (value) => isRecord(value) && isId(value.id) && isSlideKind(value.kind);

const isLessonShape: Check = shape({ id: isId, folderId: nullable(isId), title: text(MAX_TITLE_LENGTH), subject: text(MAX_TITLE_LENGTH), grade: text(MAX_TITLE_LENGTH), published: isBoolean, slides: listOf(isSlide, MAX_SLIDES_PER_LESSON), updatedAt: number(0, 8.64e15) });

/**
 * A lesson as the editor saves it. The editor saves a lesson that is not finished (no slides yet, a blank new slide, a field half typed)
 * and marks what is missing itself, so only the structure is checked here: slides of kinds the registry knows, each under its own id.
 * The stricter rules of the lesson file apply when a file is imported, not when the teacher is still writing.
 */
export const isLesson: Check = (value) => {
  if (!isLessonShape(value)) return false;
  const { slides } = value as { slides: { id: string }[] };
  return new Set(slides.map((slide) => slide.id)).size === slides.length;
};
