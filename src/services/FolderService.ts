import { createFolder, FolderTree, movedFolder } from '../domain/folders';
import { sortByOrder } from '../domain/lists';
import type { Id, LessonFolder } from '../domain/models';
import type { Caller } from '../ports/caller';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { requireAdmin } from './AuthService';
import type { LessonMover } from './LessonMover';
import { requireName } from './requireName';

export class FolderError extends Error {
  constructor(readonly code: 'folder-inside-itself' | 'folder-missing') {
    super(code);
    this.name = 'FolderError';
  }
}

/** The folders lessons are kept in: a tree the admin shapes. */
export class FolderService {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly lessons: LessonMover,
  ) {}

  watchFolders(listener: (folders: LessonFolder[]) => void): Unsubscribe {
    return this.store.watch('folders', {}, (folders) => listener(sortByOrder(folders)));
  }

  async add(name: string, parentId: Id | null): Promise<LessonFolder> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    const folders = await this.store.list('folders');
    if (parentId !== null && !new FolderTree(folders).get(parentId)) throw new FolderError('folder-missing');
    const folder = createFolder(cleaned, parentId, folders);
    await this.store.put('folders', folder);
    return folder;
  }

  async rename(folderId: Id, name: string): Promise<void> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    await this.store.update('folders', folderId, (current) => ({ ...current, name: cleaned }));
  }

  async move(folderId: Id, targetParentId: Id | null): Promise<void> {
    requireAdmin(this.caller);
    const folders = await this.store.list('folders');
    const tree = new FolderTree(folders);
    const problem = tree.moveProblem(folderId, targetParentId);
    const folder = tree.get(folderId);
    if (problem || !folder) throw new FolderError(problem ?? 'folder-missing');
    await this.store.put('folders', movedFolder(folders, folder, targetParentId));
  }

  /** Removes the folder and loses nothing: subfolders, then lessons, go to its parent before it goes. */
  async remove(folderId: Id): Promise<void> {
    requireAdmin(this.caller);
    let folders = await this.store.list('folders');
    const tree = new FolderTree(folders);
    if (!tree.get(folderId)) return;
    const parentId = tree.parentOf(folderId);
    for (const child of tree.children(folderId)) {
      const moved = movedFolder(folders, child, parentId);
      await this.store.put('folders', moved);
      folders = folders.map((f) => (f.id === moved.id ? moved : f));
    }
    await this.lessons.moveLessons(folderId, parentId);
    await this.store.remove('folders', folderId);
  }
}
