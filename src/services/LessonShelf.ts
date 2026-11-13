import type { Id } from '../domain/models';

/** What the folders ask of the lessons: to have a folder's lessons moved. It never writes a lesson itself. */
export interface LessonShelf {
  moveLessons(fromFolderId: Id, toFolderId: Id | null): Promise<void>;
}
