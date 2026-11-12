import type { ClassRoster, Id } from '../domain/models';

/** Where a class starting learns the current groups and students of its school class. */
export interface ClassRosterSource {
  rosterOfClass(classId: Id): Promise<ClassRoster>;
}
