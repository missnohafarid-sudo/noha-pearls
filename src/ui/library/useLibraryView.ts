import { useMemo } from 'react';
import type { FolderTree } from '../../domain/folders';
import { canViewLesson } from '../../domain/lessonOps';
import type { Id, Lesson } from '../../domain/models';
import { useAdmin, useFolderTree, useLessons } from '../hooks/data';

/** Everything a library screen asks about, worked out once per change of folders, lessons or reader. */
export interface LibraryView {
  tree: FolderTree;
  admin: boolean;
  /** The lessons the reader may view. */
  lessons: readonly Lesson[];
  /** Those lessons by the folder they show in. */
  lessonsByFolder: ReadonlyMap<Id | null, readonly Lesson[]>;
  /** Lessons held by each folder, at any depth. */
  counts: ReadonlyMap<Id, number>;
  /** The folders shown to the reader. */
  visible: ReadonlySet<Id>;
  /** The folder to show for a requested id: the top level (null) unless she may see that folder. */
  folderToShow: (requestedId: Id | null | undefined) => Id | null;
}

/**
 * `browse`: the lessons of the home page, where the admin also sees empty folders and unpublished lessons.
 * `pick`: the lessons to start a class with, where only folders that hold a lesson are shown.
 */
export type LibraryMode = 'browse' | 'pick';

function buildView(tree: FolderTree, all: readonly Lesson[], admin: boolean, mode: LibraryMode): LibraryView {
  const lessons = all.filter((lesson) => canViewLesson(lesson, admin));
  const visible = mode === 'pick' ? tree.holdingIds(lessons) : tree.visibleIds(all, admin);
  return {
    tree,
    admin,
    lessons,
    lessonsByFolder: tree.lessonsByFolder(lessons),
    counts: tree.lessonCounts(lessons),
    visible,
    folderToShow: (requestedId) => tree.shownFolderOf(requestedId, visible),
  };
}

export function useLibraryView(mode: LibraryMode): LibraryView | undefined {
  const tree = useFolderTree();
  const lessons = useLessons();
  const admin = useAdmin();
  return useMemo(() => (tree && lessons ? buildView(tree, lessons, admin, mode) : undefined), [tree, lessons, admin, mode]);
}
