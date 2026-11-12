import { newId } from './ids';
import { nextOrder, sortByOrder } from './lists';
import type { Id, Lesson, LessonFolder } from './models';

/** The tree lessons are kept in. Stored parent links are read only by `FolderTree`, so bad data cannot hang or hide a folder. */

export function createFolder(name: string, parentId: Id | null, existing: readonly LessonFolder[]): LessonFolder {
  return { id: newId(), name, parentId, order: nextOrder(existing) };
}

/** The folder under its new parent, last among its siblings; the same object when the parent does not change. */
export function movedFolder(folders: readonly LessonFolder[], folder: LessonFolder, targetParentId: Id | null): LessonFolder {
  return folder.parentId === targetParentId ? folder : { ...folder, parentId: targetParentId, order: nextOrder(folders) };
}

type FolderMoveProblem = 'folder-missing' | 'folder-inside-itself';

/**
 * The folders of one list, read once. A folder's parent is its stored parent when that exists and does not
 * lead back to the folder; otherwise the folder shows at the top level. Build one per list and ask it.
 */
export class FolderTree {
  private readonly byId = new Map<Id, LessonFolder>();
  private readonly parents = new Map<Id, Id | null>();
  private readonly childrenOf = new Map<Id | null, LessonFolder[]>();

  constructor(folders: readonly LessonFolder[]) {
    for (const folder of folders) this.byId.set(folder.id, folder);
    for (const folder of folders) this.parents.set(folder.id, folder.parentId !== null && this.byId.has(folder.parentId) ? folder.parentId : null);
    this.detachLoops(folders);
    for (const folder of sortByOrder(folders)) {
      const parentId = this.parents.get(folder.id) ?? null;
      this.childrenOf.set(parentId, [...(this.childrenOf.get(parentId) ?? []), folder]);
    }
  }

  get(id: Id): LessonFolder | null {
    return this.byId.get(id) ?? null;
  }

  parentOf(id: Id): Id | null {
    return this.parents.get(id) ?? null;
  }

  children(parentId: Id | null): readonly LessonFolder[] {
    return this.childrenOf.get(parentId) ?? [];
  }

  /** From the top level down to the folder; empty for the top level or an unknown folder. */
  path(folderId: Id | null): LessonFolder[] {
    const path: LessonFolder[] = [];
    let current = folderId === null ? null : this.get(folderId);
    while (current) {
      path.push(current);
      const parentId = this.parentOf(current.id);
      current = parentId === null ? null : this.get(parentId);
    }
    return path.reverse();
  }

  /** Every folder inside the folder, at any depth (not the folder itself). */
  within(folderId: Id): Set<Id> {
    const within = new Set<Id>();
    const pending = [folderId];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      for (const child of this.children(next)) {
        within.add(child.id);
        pending.push(child.id);
      }
    }
    return within;
  }

  /** Why a folder cannot go under the target, or null when it can. Staying where it is is allowed. */
  moveProblem(folderId: Id, targetParentId: Id | null): FolderMoveProblem | null {
    if (!this.byId.has(folderId)) return 'folder-missing';
    if (targetParentId === null) return null;
    if (!this.byId.has(targetParentId)) return 'folder-missing';
    return targetParentId === folderId || this.within(folderId).has(targetParentId) ? 'folder-inside-itself' : null;
  }

  canMove(folderId: Id, targetParentId: Id | null): boolean {
    return this.moveProblem(folderId, targetParentId) === null;
  }

  /** The lesson's folder when it exists, else the top level (also for data stored before folders existed). */
  folderOf(lesson: Pick<Lesson, 'folderId'>): Id | null {
    const id = lesson.folderId ?? null;
    return id !== null && this.byId.has(id) ? id : null;
  }

  lessonsIn<T extends Pick<Lesson, 'folderId'>>(lessons: readonly T[], folderId: Id | null): T[] {
    return lessons.filter((lesson) => this.folderOf(lesson) === folderId);
  }

  /** The lessons in the folder and in everything within it. */
  lessonCountWithin(lessons: readonly Pick<Lesson, 'folderId'>[], folderId: Id): number {
    const inside = this.within(folderId).add(folderId);
    return lessons.filter((lesson) => inside.has(this.folderOf(lesson) ?? '')).length;
  }

  hasLessonsWithin(lessons: readonly Pick<Lesson, 'folderId'>[], folderId: Id): boolean {
    return this.lessonCountWithin(lessons, folderId) > 0;
  }

  /** Walks each stored chain once; the folders of a loop lose their parent, the ones hanging off it keep theirs. */
  private detachLoops(folders: readonly LessonFolder[]): void {
    const walked = new Set<Id>();
    for (const start of folders) {
      const chain: Id[] = [];
      const onChain = new Set<Id>();
      let at: Id | null = start.id;
      while (at !== null && !walked.has(at)) {
        walked.add(at);
        onChain.add(at);
        chain.push(at);
        at = this.parents.get(at) ?? null;
      }
      if (at !== null && onChain.has(at)) for (const id of chain.slice(chain.indexOf(at))) this.parents.set(id, null);
    }
  }
}
