import { newId } from './ids';
import type { Id, Lesson, Slide, SlideKind } from './models';
import { slideKindSpec } from './slideKinds';

/** Pure edits on a lesson. Each returns a new lesson; nothing is persisted here. */

export function createLesson(title: string, folderId: Id | null, now = Date.now()): Lesson {
  return { id: newId(), folderId, title, subject: '', grade: '', published: false, slides: [], updatedAt: now };
}

/** Unpublished lessons exist for the admin only. */
export function canViewLesson(lesson: Lesson, isAdmin: boolean): boolean {
  return lesson.published || isAdmin;
}

/** Where the selection lands after the slide at `removedIndex` is deleted. */
export function indexAfterRemoval(currentIndex: number, removedIndex: number, countBefore: number): number {
  const shifted = removedIndex < currentIndex ? currentIndex - 1 : currentIndex;
  return clampIndex(shifted, countBefore - 1);
}

/** Inserts a blank slide after `afterIndex` (use -1 to insert first). */
export function addSlide(lesson: Lesson, kind: SlideKind, afterIndex: number): { lesson: Lesson; slide: Slide } {
  const slide = slideKindSpec(kind).create(newId());
  const at = clampIndex(afterIndex + 1, lesson.slides.length + 1);
  const slides = [...lesson.slides.slice(0, at), slide, ...lesson.slides.slice(at)];
  return { lesson: { ...lesson, slides }, slide };
}

/** Inserts an exact copy of a slide right below it, under a new id. An unknown id leaves the lesson as it was. */
export function duplicateSlide(lesson: Lesson, slideId: Id): Lesson {
  const at = lesson.slides.findIndex((s) => s.id === slideId);
  if (at < 0) return lesson;
  const copy: Slide = { ...structuredClone(lesson.slides[at]), id: newId() };
  return { ...lesson, slides: [...lesson.slides.slice(0, at + 1), copy, ...lesson.slides.slice(at + 1)] };
}

/** Repairs fields that an edit left inconsistent (see each kind's `normalize`). */
export function normalizeSlide(slide: Slide): Slide {
  const spec = slideKindSpec(slide.kind);
  return spec.normalize ? spec.normalize(slide) : slide;
}

/** Whether the slide cannot show what it should (see each kind's `hasProblem`). */
export function slideHasProblem(slide: Slide): boolean {
  return slideKindSpec(slide.kind).hasProblem?.(slide) ?? false;
}

export function updateSlide(lesson: Lesson, slide: Slide): Lesson {
  const clean = normalizeSlide(slide);
  return { ...lesson, slides: lesson.slides.map((s) => (s.id === clean.id ? clean : s)) };
}

export function removeSlide(lesson: Lesson, slideId: Id): Lesson {
  return { ...lesson, slides: lesson.slides.filter((s) => s.id !== slideId) };
}

/** Moves a slide by `delta` positions; out-of-range moves are ignored. */
export function moveSlide(lesson: Lesson, slideId: Id, delta: number): Lesson {
  const from = lesson.slides.findIndex((s) => s.id === slideId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= lesson.slides.length) return lesson;
  const slides = [...lesson.slides];
  const [moved] = slides.splice(from, 1);
  slides.splice(to, 0, moved);
  return { ...lesson, slides };
}

/** Clamps an index into `[0, count - 1]` (0 when the list is empty). */
export function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}
