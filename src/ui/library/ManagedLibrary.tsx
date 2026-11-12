import { useState } from 'react';
import type { MoveItem } from '../../domain/folders';
import type { Id } from '../../domain/models';
import { FocusProvider, focusKey, useFocusRequest } from './focus';
import { LessonCard } from './LessonCard';
import { LibraryBrowser } from './LibraryBrowser';
import { ManagedFolderTile } from './ManagedFolderTile';
import { MoveDialog } from './MoveDialog';
import { NewFolderTile } from './NewFolderTile';
import { DragMoveProvider } from './useDragMove';
import { useLibraryActions, type LibraryActions } from './useLibraryActions';
import type { LibraryView } from './useLibraryView';

interface ManagedLibraryProps {
  view: LibraryView;
  openId: Id | null;
  onOpen: (folderId: Id | null) => void;
}

/** What is being moved by the dialog, with its name for the title. */
interface Moving {
  item: MoveItem;
  name: string;
}

function ManagedContent({ view, openId, onOpen, actions, error }: ManagedLibraryProps & { actions: LibraryActions; error: string | null }) {
  const [moving, setMoving] = useState<Moving | null>(null);
  const request = useFocusRequest();

  const moveTo = async (target: Id | null) => {
    if (moving && (await actions.move(moving.item, target))) request(openId === null ? focusKey.library : focusKey.crumb);
  };

  return (
    <>
      <LibraryBrowser
        view={view}
        openId={openId}
        onOpen={onOpen}
        renderFolder={(folder, next) => (
          <ManagedFolderTile
            key={folder.id}
            folder={folder}
            view={view}
            next={next}
            actions={actions}
            onOpen={onOpen}
            onMove={() => setMoving({ item: { kind: 'folder', id: folder.id }, name: folder.name })}
          />
        )}
        afterFolders={<NewFolderTile parentId={openId} actions={actions} />}
        renderLesson={(lesson) => {
          const from = view.tree.folderOf(lesson);
          return <LessonCard lesson={lesson} admin from={from} onMove={() => setMoving({ item: { kind: 'lesson', id: lesson.id, from }, name: lesson.title })} />;
        }}
      >
        {error && <p className="notice notice--bad">{error}</p>}
      </LibraryBrowser>
      {moving && <MoveDialog key={moving.item.id} tree={view.tree} item={moving.item} name={moving.name} onPick={(target) => void moveTo(target)} onClose={() => setMoving(null)} />}
    </>
  );
}

/** The lessons and folders as the admin sees them: she also makes, renames, moves (by drag or by the dialog) and deletes folders here. */
export function ManagedLibrary(props: ManagedLibraryProps) {
  const { actions, error } = useLibraryActions();
  return (
    <FocusProvider>
      <DragMoveProvider tree={props.view.tree} onMove={actions.move}>
        <ManagedContent {...props} actions={actions} error={error} />
      </DragMoveProvider>
    </FocusProvider>
  );
}
