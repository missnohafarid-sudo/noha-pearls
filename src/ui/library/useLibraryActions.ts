import { useMemo } from 'react';
import type { MoveItem } from '../../domain/folders';
import type { Id } from '../../domain/models';
import { useAttempt } from '../common/useAttempt';
import { useServices } from '../ServicesContext';

/** What the library may ask of the application; each reports whether it went through. */
export interface LibraryActions {
  /** The new folder's id, or null when it was refused. */
  addFolder: (name: string, parentId: Id | null) => Promise<Id | null>;
  renameFolder: (folderId: Id, name: string) => Promise<boolean>;
  removeFolder: (folderId: Id) => Promise<boolean>;
  move: (item: MoveItem, target: Id | null) => Promise<boolean>;
}

/** The library's commands through the services, and the notice text of the last refusal. */
export function useLibraryActions(): { actions: LibraryActions; error: string | null } {
  const { folders, lessons } = useServices();
  const { attempt, attemptWith, error } = useAttempt();
  const actions = useMemo<LibraryActions>(
    () => ({
      addFolder: async (name, parentId) => (await attemptWith(() => folders.add(name, parentId)))?.value.id ?? null,
      renameFolder: (folderId, name) => attempt(() => folders.rename(folderId, name)),
      removeFolder: (folderId) => attempt(() => folders.remove(folderId)),
      move: (item, target) => attempt(() => (item.kind === 'lesson' ? lessons.moveToFolder([item.id], target) : folders.move(item.id, target))),
    }),
    [attempt, attemptWith, folders, lessons],
  );
  return { actions, error };
}
