import { createFolder, FolderTree, movedFolder } from '../domain/folders';
import { sortByOrder } from '../domain/lists';
import type { Id, LessonFolder } from '../domain/models';
import type { Caller } from '../ports/caller';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import { requireAdmin } from './AuthService';
import type { LessonShelf } from './LessonShelf';
import { FolderError, requireFolder } from './requireFolder';
import { requireName } from './requireName';

/** The folders lessons are kept in: a tree the admin shapes. */
export class FolderService {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly lessons: LessonShelf,
  ) {}

  watchFolders(listener: (folders: LessonFolder[]) => void): Unsubscribe {
    return this.store.watch('folders', {}, (folders) => listener(sortByOrder(folders)));
  }

  /** Stores the repairs that make the stored tree agree with the shown one, and returns the folders as they now are. */
  private async healed(): Promise<LessonFolder[]> {
    const stored = await this.store.list('folders');
    const repairs = new Map(new FolderTree(stored).repairs().map((folder) => [folder.id, folder]));
    for (const repair of repairs.values()) await this.store.update('folders', repair.id, (current) => ({ ...current, parentId: repair.parentId }));
    return stored.map((folder) => repairs.get(folder.id) ?? folder);
  }

  /** Puts the folder last under the parent, keeping every other field it has now. Returns the list as it now is. */
  private async reparent(folders: readonly LessonFolder[], folder: LessonFolder, parentId: Id | null): Promise<LessonFolder[]> {
    const moved = movedFolder(folders, folder, parentId);
    await this.store.update('folders', folder.id, (current) => ({ ...current, parentId: moved.parentId, order: moved.order }));
    return folders.map((f) => (f.id === moved.id ? moved : f));
  }

  async add(name: string, parentId: Id | null): Promise<LessonFolder> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    await requireFolder(this.store, parentId);
    const folders = await this.healed();
    const folder = createFolder(cleaned, parentId, folders);
    await this.store.put('folders', folder);
    return folder;
  }

  async rename(folderId: Id, name: string): Promise<void> {
    requireAdmin(this.caller);
    const cleaned = requireName(name);
    if (!(await this.store.update('folders', folderId, (current) => ({ ...current, name: cleaned })))) throw new FolderError('folder-missing');
  }

  async move(folderId: Id, targetParentId: Id | null): Promise<void> {
    requireAdmin(this.caller);
    const folders = await this.healed();
    const tree = new FolderTree(folders);
    const problem = tree.moveProblem(folderId, targetParentId);
    const folder = tree.get(folderId);
    if (problem || !folder) throw new FolderError(problem ?? 'folder-missing');
    await this.reparent(folders, folder, targetParentId);
  }

  /** Removes the folder and loses nothing: subfolders, then lessons, go to its parent before it goes. */
  async remove(folderId: Id): Promise<void> {
    requireAdmin(this.caller);
    let folders = await this.healed();
    const tree = new FolderTree(folders);
    if (!tree.get(folderId)) return;
    const parentId = tree.parentOf(folderId);
    for (const child of tree.children(folderId)) folders = await this.reparent(folders, child, parentId);
    await this.lessons.moveLessons(folderId, parentId);
    await this.store.remove('folders', folderId);
  }
}
