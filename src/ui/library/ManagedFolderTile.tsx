import { useState } from 'react';
import type { LessonFolder } from '../../domain/models';
import { t } from '../../i18n';
import { focusKey, useFocusRequest, useFocusTarget } from './focus';
import { FolderTile } from './FolderTile';
import { InPlaceName } from './InPlaceName';
import type { LibraryActions } from './useLibraryActions';
import type { LibraryView } from './useLibraryView';

const tl = t.library;

interface ManagedFolderTileProps {
  folder: LessonFolder;
  view: LibraryView;
  actions: LibraryActions;
  onOpen: (folderId: string) => void;
  onMove: () => void;
  onDelete: () => void;
}

/** A folder tile for the admin: it can be renamed in place, moved, deleted and dragged. */
export function ManagedFolderTile({ folder, view, actions, onOpen, onMove, onDelete }: ManagedFolderTileProps) {
  const [renaming, setRenaming] = useState(false);
  const request = useFocusRequest();
  const renameRef = useFocusTarget<HTMLButtonElement>(focusKey.rename(folder.id));

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

  return (
    <FolderTile folder={folder} holds={view.counts.get(folder.id) ?? 0} onOpen={onOpen} nameField={nameField}>
      <div className="folder-tile__actions">
        <button type="button" ref={renameRef} className="quiet-action" aria-label={tl.renameFolder(folder.name)} onClick={() => setRenaming(true)}>
          {tl.rename}
        </button>
        <button type="button" className="quiet-action" aria-label={tl.moveFolder(folder.name)} onClick={onMove}>
          {tl.moveWord}
        </button>
        <button type="button" className="quiet-action quiet-action--bad" aria-label={tl.deleteFolder(folder.name)} onClick={onDelete}>
          {t.common.remove}
        </button>
      </div>
    </FolderTile>
  );
}
