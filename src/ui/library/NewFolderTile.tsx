import { useState } from 'react';
import type { Id } from '../../domain/models';
import { t } from '../../i18n';
import { focusKey, useFocusRequest, useFocusTarget } from './focus';
import { InPlaceName } from './InPlaceName';
import type { LibraryActions } from './useLibraryActions';

/** The last tile for the admin: pressing it turns it into a field for the new folder's name. */
export function NewFolderTile({ parentId, actions }: { parentId: Id | null; actions: LibraryActions }) {
  const [typing, setTyping] = useState(false);
  const request = useFocusRequest();
  const buttonRef = useFocusTarget<HTMLButtonElement>(focusKey.newFolder);

  const create = async (name: string, byKey: boolean) => {
    const madeId = await actions.addFolder(name, parentId);
    if (madeId !== null && byKey) request(focusKey.open(madeId));
  };

  if (typing) {
    return (
      <div className="folder-tile folder-tile--new">
        <InPlaceName
          initial=""
          onCommit={(name, byKey) => {
            setTyping(false);
            void create(name, byKey);
          }}
          onCancel={(byKey) => {
            setTyping(false);
            if (byKey) request(focusKey.newFolder);
          }}
        />
      </div>
    );
  }
  return (
    <button type="button" ref={buttonRef} className="folder-tile folder-tile--new" onClick={() => setTyping(true)}>
      <span className="folder-tile__plus" aria-hidden="true" />
      {t.library.newFolder}
    </button>
  );
}
