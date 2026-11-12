import type { FolderTree } from '../../domain/folders';
import type { Id } from '../../domain/models';
import { t } from '../../i18n';

/** Where a folder is, in words: the top level, then each folder down to it. */
export function pathText(tree: FolderTree, folderId: Id | null): string {
  return [t.library.rootName, ...tree.path(folderId).map((folder) => folder.name)].join(t.library.pathSeparator);
}
