import { exportLesson, importLesson, type ImportResult } from '../domain/lessonFormat';
import { createLesson } from '../domain/lessonOps';
import type { Id, Lesson } from '../domain/models';
import { canRemoveLesson } from '../domain/sessions';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { AuthService } from './AuthService';

export class LessonError extends Error {
  constructor(readonly code: 'lesson-in-use') {
    super(code);
    this.name = 'LessonError';
  }
}

/** Lessons: authoring, import and export. Slide edits are pure functions in `domain/lessonOps`. */
export class LessonService {
  constructor(
    private readonly store: DocumentStore,
    private readonly auth: AuthService,
  ) {}

  /** Newest first. */
  watchLessons(listener: (lessons: Lesson[]) => void): Unsubscribe {
    return this.store.watch('lessons', {}, (lessons) => listener([...lessons].sort((a, b) => b.updatedAt - a.updatedAt)));
  }

  watchLesson(lessonId: Id, listener: (lesson: Lesson | null) => void): Unsubscribe {
    return this.store.watch('lessons', { id: lessonId }, (lessons) => listener(lessons[0] ?? null));
  }

  async create(title: string): Promise<Lesson> {
    this.auth.requireAdmin();
    const lesson = createLesson(title);
    await this.store.put('lessons', lesson);
    return lesson;
  }

  async save(lesson: Lesson): Promise<void> {
    this.auth.requireAdmin();
    await this.store.put('lessons', { ...lesson, updatedAt: Date.now() });
  }

  /** Removes the lesson, unless a running class uses it. */
  async remove(lessonId: Id): Promise<void> {
    this.auth.requireAdmin();
    if (!canRemoveLesson(lessonId, await this.store.list('sessions'))) throw new LessonError('lesson-in-use');
    await this.store.remove('lessons', lessonId);
  }

  /** Reads a lesson file (uploaded or pasted). Saves the lesson only when the file is valid. */
  async importFromText(text: string): Promise<ImportResult> {
    this.auth.requireAdmin();
    const result = importLesson(text);
    if (result.ok) await this.store.put('lessons', result.lesson);
    return result;
  }

  exportToText(lesson: Lesson): string {
    return exportLesson(lesson);
  }
}
