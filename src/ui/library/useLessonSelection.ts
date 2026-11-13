import { useState } from 'react';
import type { Id, LessonSummary } from '../../domain/models';

const NONE: ReadonlySet<Id> = new Set();

/** The lessons the admin has ticked in the folder that is open. Opening another folder starts over, and a lesson that has left the list is no longer ticked. */
export function useLessonSelection(folderId: Id | null, lessons: readonly LessonSummary[]) {
  const [ticked, setTicked] = useState<{ folderId: Id | null; ids: ReadonlySet<Id> }>({ folderId, ids: NONE });
  const ids = ticked.folderId === folderId ? ticked.ids : NONE;
  const selected = lessons.filter((lesson) => ids.has(lesson.id));
  if (ticked.folderId !== folderId || selected.length !== ids.size) setTicked({ folderId, ids: new Set(selected.map((lesson) => lesson.id)) });

  const change = (changed: readonly LessonSummary[], on: boolean) => {
    const next = new Set(selected.map((lesson) => lesson.id));
    for (const lesson of changed) if (on) next.add(lesson.id); else next.delete(lesson.id);
    setTicked({ folderId, ids: next });
  };

  return {
    selected,
    allSelected: lessons.length > 0 && selected.length === lessons.length,
    isSelected: (lesson: LessonSummary) => ids.has(lesson.id),
    select: (lesson: LessonSummary, on: boolean) => change([lesson], on),
    selectAll: (on: boolean) => change(lessons, on),
  };
}

export type LessonSelection = ReturnType<typeof useLessonSelection>;
