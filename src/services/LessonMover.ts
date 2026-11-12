import type { Id } from '../domain/models';

/** How the service that removes a folder has its lessons moved. It never writes a lesson itself. */
export interface LessonMover {
  moveLessons(fromFolderId: Id, toFolderId: Id | null): Promise<void>;
}
