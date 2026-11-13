import type { Id, Lesson } from '../domain/models';
import type { Unsubscribe } from '../ports/store';

export type LessonPlacement = Pick<Lesson, 'folderId' | 'published'>;

/** Where the folders learn how the lessons sit in them: which folder holds each, whether it is published, and the moving of a folder's lessons. */
export interface LessonShelf {
  watchPlacements(listener: (placements: LessonPlacement[]) => void): Unsubscribe;
  moveLessons(fromFolderId: Id, toFolderId: Id | null): Promise<void>;
}
