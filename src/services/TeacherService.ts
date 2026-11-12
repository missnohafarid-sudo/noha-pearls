import { sortByOrder } from '../domain/lists';
import type { Id, Teacher } from '../domain/models';
import { canRemoveTeacher } from '../domain/sessions';
import { createTeacher } from '../domain/teachers';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { requireAdmin } from './AuthService';
import { requireName } from './requireName';

export class TeacherError extends Error {
  constructor(readonly code: 'teacher-in-use') {
    super(code);
    this.name = 'TeacherError';
  }
}

/** The list of teachers a class can be started by. A teacher is a name, not an account. */
export class TeacherService {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
  ) {}

  watchTeachers(listener: (teachers: Teacher[]) => void): Unsubscribe {
    return this.store.watch('teachers', {}, (teachers) => listener(sortByOrder(teachers)));
  }

  async add(name: string): Promise<Teacher> {
    requireAdmin(this.caller);
    const teacher = createTeacher(requireName(name), await this.store.list('teachers'));
    await this.store.put('teachers', teacher);
    return teacher;
  }

  async rename(teacherId: Id, name: string): Promise<void> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    await this.store.update('teachers', teacherId, (current) => ({ ...current, name: cleaned }));
  }

  /** Removes the teacher, unless a running class is hers. */
  async remove(teacherId: Id): Promise<void> {
    requireAdmin(this.caller);
    if (!canRemoveTeacher(teacherId, await this.store.list('sessions'))) throw new TeacherError('teacher-in-use');
    await this.store.remove('teachers', teacherId);
  }
}
