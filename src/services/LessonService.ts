import { importLesson, lessonFileText, type ImportResult } from '../domain/lessonFormat';
import { createLesson } from '../domain/lessonOps';
import type { Id, Lesson, LessonSummary } from '../domain/models';
import { catalogueFor, lessonFor } from '../domain/visibility';
import { canRemoveLesson } from '../domain/sessions';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { NOT_REMEMBERED, type ComputedOnce } from './ComputedOnce';
import { requireAdmin } from './AuthService';
import type { LessonPlacement, LessonShelf } from './LessonShelf';
import { requireFolder } from './requireFolder';

export class LessonError extends Error {
  constructor(readonly code: 'lesson-in-use' | 'lesson-missing') {
    super(code);
    this.name = 'LessonError';
  }
}

/** Lessons: authoring, import and export. Slide edits are pure functions in `domain/lessonOps`. */
export class LessonService implements LessonShelf {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly shared: ComputedOnce = NOT_REMEMBERED,
  ) {}

  /**
   * Newest first: the summaries of every lesson for the admin, of the published ones for anyone else. Who the caller is
   * is asked at each emission; a change of sign-in is followed by subscribing again.
   */
  watchLessons(listener: (lessons: LessonSummary[]) => void): Unsubscribe {
    return this.store.watch('lessons', {}, (lessons) => {
      const isAdmin = this.caller.isAdmin();
      listener(this.shared.get(`catalogue|${isAdmin}`, () => catalogueFor(isAdmin, lessons)));
    });
  }

  /** The whole lesson for the admin; for anyone else the published lesson without its answer key, else null. */
  watchLesson(lessonId: Id, listener: (lesson: Lesson | null) => void): Unsubscribe {
    return this.store.watch('lessons', { id: lessonId }, (lessons) => {
      const isAdmin = this.caller.isAdmin();
      listener(this.shared.get(`lesson|${lessonId}|${isAdmin}`, () => lessonFor(isAdmin, lessons[0] ?? null)));
    });
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
  async moveToFolder(lessonIds: readonly Id[], folderId: Id | null): Promise<void> {
    requireAdmin(this.caller);
    await requireFolder(this.store, folderId);
    await this.updateEach(lessonIds, (current) => ({ ...current, folderId }));
  }

  /** Applies the change to each lesson, and reports `lesson-missing` after the others are done if any no longer exists. */
  private async updateEach(lessonIds: readonly Id[], change: (current: Lesson) => Lesson): Promise<void> {
    let missing = false;
    for (const lessonId of lessonIds) missing = !(await this.store.update('lessons', lessonId, change)) || missing;
    if (missing) throw new LessonError('lesson-missing');
  }

  /** Where each lesson sits and whether it is published: nothing else of it. */
  watchPlacements(listener: (placements: LessonPlacement[]) => void): Unsubscribe {
    return this.store.watch('lessons', {}, (lessons) => listener(lessons.map(({ folderId, published }) => ({ folderId, published }))));
  }

  async moveLessons(fromFolderId: Id, toFolderId: Id | null): Promise<void> {
    requireAdmin(this.caller);
    for (const lesson of await this.store.list('lessons', { folderId: fromFolderId })) {
      await this.store.update('lessons', lesson.id, (current) => ({ ...current, folderId: toFolderId }));
    }
  }

  /** Removes the lessons, or none of them when a running class uses any. */
  async remove(lessonIds: readonly Id[]): Promise<void> {
    requireAdmin(this.caller);
    await this.removeUnlessInUse(lessonIds);
  }

  private async removeUnlessInUse(lessonIds: readonly Id[]): Promise<void> {
    const sessions = await this.store.list('sessions');
    if (!lessonIds.every((lessonId) => canRemoveLesson(lessonId, sessions))) throw new LessonError('lesson-in-use');
    for (const lessonId of lessonIds) await this.store.remove('lessons', lessonId);
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
