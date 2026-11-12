import { importLesson, lessonFileText, type ImportResult } from '../domain/lessonFormat';
import { createLesson } from '../domain/lessonOps';
import type { Id, Lesson } from '../domain/models';
import { canRemoveLesson } from '../domain/sessions';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { requireAdmin } from './AuthService';
import type { LessonMover } from './LessonMover';
import { requireFolder } from './requireFolder';

export class LessonError extends Error {
  constructor(readonly code: 'lesson-in-use' | 'lesson-missing') {
    super(code);
    this.name = 'LessonError';
  }
}

/** Lessons: authoring, import and export. Slide edits are pure functions in `domain/lessonOps`. */
export class LessonService implements LessonMover {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
  ) {}

  /** Newest first. */
  watchLessons(listener: (lessons: Lesson[]) => void): Unsubscribe {
    return this.store.watch('lessons', {}, (lessons) => listener([...lessons].sort((a, b) => b.updatedAt - a.updatedAt)));
  }

  watchLesson(lessonId: Id, listener: (lesson: Lesson | null) => void): Unsubscribe {
    return this.store.watch('lessons', { id: lessonId }, (lessons) => listener(lessons[0] ?? null));
  }

  async create(title: string, folderId: Id | null): Promise<Lesson> {
    requireAdmin(this.caller);
    await requireFolder(this.store, folderId);
    const lesson = createLesson(title, folderId);
    await this.store.put('lessons', lesson);
    return lesson;
  }

  /** Saves an edit. The folder is never taken from the edited copy: a stale copy must not undo a move. A lesson that was deleted stays deleted. */
  async save(lesson: Lesson): Promise<void> {
    requireAdmin(this.caller);
    const saved = await this.store.update('lessons', lesson.id, (current) => ({ ...lesson, folderId: current.folderId, updatedAt: Date.now() }));
    if (!saved) throw new LessonError('lesson-missing');
  }

  /** Moving is not editing: the lesson keeps its edit time. */
  async moveToFolder(lessonId: Id, folderId: Id | null): Promise<void> {
    requireAdmin(this.caller);
    await requireFolder(this.store, folderId);
    if (!(await this.store.update('lessons', lessonId, (current) => ({ ...current, folderId })))) throw new LessonError('lesson-missing');
  }

  async moveLessons(fromFolderId: Id, toFolderId: Id | null): Promise<void> {
    requireAdmin(this.caller);
    for (const lesson of await this.store.list('lessons', { folderId: fromFolderId })) {
      await this.store.update('lessons', lesson.id, (current) => ({ ...current, folderId: toFolderId }));
    }
  }

  /** Removes the lesson, unless a running class uses it. */
  async remove(lessonId: Id): Promise<void> {
    requireAdmin(this.caller);
    if (!canRemoveLesson(lessonId, await this.store.list('sessions'))) throw new LessonError('lesson-in-use');
    await this.store.remove('lessons', lessonId);
  }

  /** Reads a lesson file (uploaded or pasted). Saves the lesson only when the file is valid. */
  async importFromText(text: string, folderId: Id | null): Promise<ImportResult> {
    requireAdmin(this.caller);
    await requireFolder(this.store, folderId);
    const result = importLesson(text);
    if (result.ok) await this.store.put('lessons', { ...result.lesson, folderId });
    return result;
  }

  exportToText(lesson: Lesson): string {
    return lessonFileText(lesson);
  }
}
