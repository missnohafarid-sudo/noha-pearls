import { newId } from './ids';
import { nextOrder, sortByOrder } from './lists';
import { canViewLesson } from './lessonOps';
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

/** Why an item cannot be put in a place: it is already there, the place is gone, or a folder would go inside itself. */
export type PlaceProblem = FolderMoveProblem | 'here';

/** What is being moved: a lesson (with the folder it is in now) or a folder. */
export type MoveItem = { kind: 'lesson'; id: Id; from: Id | null } | { kind: 'folder'; id: Id };

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
      const siblings = this.childrenOf.get(parentId);
      if (siblings) siblings.push(folder);
      else this.childrenOf.set(parentId, [folder]);
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

  /**
   * The folders a reader sees. The admin sees every folder, empty ones too; anyone else sees a folder only when it
   * holds, at any depth, a lesson she may view. A folder with such a lesson inside makes all its ancestors visible.
   */
  visibleIds(lessons: readonly Pick<Lesson, 'folderId' | 'published'>[], isAdmin: boolean): Set<Id> {
    return isAdmin ? this.ids() : this.holdingIds(lessons.filter((lesson) => canViewLesson(lesson, false)));
  }

  /** Every folder of the list. */
  ids(): Set<Id> {
    return new Set(this.byId.keys());
  }

  /** The folders that hold at least one of the lessons, at any depth. */
  holdingIds(lessons: readonly Pick<Lesson, 'folderId'>[]): Set<Id> {
    return new Set(this.lessonCounts(lessons).keys());
  }

  /** The folders of a folder among the visible ones. */
  shownChildren(parentId: Id | null, visible: ReadonlySet<Id>): readonly LessonFolder[] {
    return this.children(parentId).filter((folder) => visible.has(folder.id));
  }

  /** The folder a page shows for a requested id: that folder when it exists and the reader sees it, else the top level (null). */
  shownFolderOf(requestedId: Id | null | undefined, visible: ReadonlySet<Id>): Id | null {
    return requestedId && this.byId.has(requestedId) && visible.has(requestedId) ? requestedId : null;
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

  /** The lesson's folder when it exists, else the top level (also for data stored before folders existed). */
  folderOf(lesson: Pick<Lesson, 'folderId'>): Id | null {
    const id = lesson.folderId ?? null;
    return id !== null && this.byId.has(id) ? id : null;
  }

  /** The lessons grouped by the folder they show in; the top level is null. */
  lessonsByFolder<T extends Pick<Lesson, 'folderId'>>(lessons: readonly T[]): Map<Id | null, T[]> {
    const groups = new Map<Id | null, T[]>();
    for (const lesson of lessons) {
      const folderId = this.folderOf(lesson);
      const group = groups.get(folderId);
      if (group) group.push(lesson);
      else groups.set(folderId, [lesson]);
    }
    return groups;
  }

  /** For each folder holding lessons, how many it holds counting everything within it. Read in one pass over the lessons. */
  lessonCounts(lessons: readonly Pick<Lesson, 'folderId'>[]): Map<Id, number> {
    const counts = new Map<Id, number>();
    for (const lesson of lessons) {
      for (let at = this.folderOf(lesson); at !== null; at = this.parentOf(at)) counts.set(at, (counts.get(at) ?? 0) + 1);
    }
    return counts;
  }

  /** Why the item cannot go into the folder (null is the top level), or null when it can. */
  placeProblem(item: MoveItem, targetFolderId: Id | null): PlaceProblem | null {
    if (item.kind === 'lesson') {
      if (targetFolderId !== null && !this.byId.has(targetFolderId)) return 'folder-missing';
      return targetFolderId === item.from ? 'here' : null;
    }
    return this.moveProblem(item.id, targetFolderId) ?? (targetFolderId === this.parentOf(item.id) ? 'here' : null);
  }

  /** The folders whose stored parent differs from the one shown, each with the shown parent: storing them makes stored and shown agree. */
  repairs(): LessonFolder[] {
    const repaired: LessonFolder[] = [];
    for (const folder of this.byId.values()) {
      const shown = this.parentOf(folder.id);
      if ((folder.parentId ?? null) !== shown) repaired.push({ ...folder, parentId: shown });
    }
    return repaired;
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
