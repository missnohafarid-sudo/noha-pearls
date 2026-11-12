import { useState } from 'react';
import type { LessonFolder } from '../../domain/models';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { focusKey, useFocusRequest, useFocusTarget } from './focus';
import { FolderTile } from './FolderTile';
import { InPlaceName } from './InPlaceName';
import type { LibraryActions } from './useLibraryActions';
import type { LibraryView } from './useLibraryView';

const tl = t.library;

interface ManagedFolderTileProps {
  folder: LessonFolder;
  view: LibraryView;
  /** The tile after this one, where focus goes when this folder is deleted. */
  next: LessonFolder | undefined;
  actions: LibraryActions;
  onOpen: (folderId: string) => void;
  onMove: () => void;
}

/** A folder tile for the admin: it can be renamed in place, moved, deleted and dragged. */
export function ManagedFolderTile({ folder, view, next, actions, onOpen, onMove }: ManagedFolderTileProps) {
  const [renaming, setRenaming] = useState(false);
  const request = useFocusRequest();
  const renameRef = useFocusTarget<HTMLButtonElement>(focusKey.rename(folder.id));
  const parentId = view.tree.parentOf(folder.id);
  const parentName = parentId === null ? null : (view.tree.get(parentId)?.name ?? null);
  const consequence = tl.deleteConfirm(view.tree.children(folder.id).length, view.lessonsByFolder.get(folder.id)?.length ?? 0, parentName);

  const finishRename = (byKey: boolean) => {
    setRenaming(false);
    if (byKey) request(focusKey.rename(folder.id));
  };

  const nameField = renaming ? (
    <InPlaceName
      initial={folder.name}
      onCommit={(name, byKey) => {
        finishRename(byKey);
        void actions.renameFolder(folder.id, name);
      }}
      onCancel={finishRename}
    />
  ) : undefined;

  const remove = async () => {
    if (await actions.removeFolder(folder.id)) request(next ? focusKey.open(next.id) : focusKey.newFolder);
  };

  return (
    <FolderTile folder={folder} holds={view.counts.get(folder.id) ?? 0} onOpen={onOpen} nameField={nameField}>
      <div className="folder-tile__actions">
        <button type="button" ref={renameRef} className="quiet-action" aria-label={tl.renameFolder(folder.name)} onClick={() => setRenaming(true)}>
          {tl.rename}
        </button>
        <button type="button" className="quiet-action" aria-label={tl.moveFolder(folder.name)} onClick={onMove}>
          {tl.moveWord}
        </button>
        <ConfirmButton className="quiet-action quiet-action--bad" ariaLabel={tl.deleteFolder(folder.name)} consequence={consequence} onConfirm={() => void remove()}>
          {t.common.remove}
        </ConfirmButton>
      </div>
    </FolderTile>
  );
}
