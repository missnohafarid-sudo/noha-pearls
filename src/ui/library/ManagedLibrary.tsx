import { useState } from 'react';
import type { MoveItem } from '../../domain/folders';
import type { Id, LessonFolder } from '../../domain/models';
import { t } from '../../i18n';
import { DeleteFolderDialog } from './DeleteFolderDialog';
import { FocusProvider, focusKey, useFocusRequest } from './focus';
import { LessonCard } from './LessonCard';
import { LibraryBrowser } from './LibraryBrowser';
import { ManagedFolderTile } from './ManagedFolderTile';
import { MoveDialog } from './MoveDialog';
import { NewFolderTile } from './NewFolderTile';
import { SelectionBar } from './SelectionBar';
import { DragMoveProvider } from './useDragMove';
import { useLessonSelection } from './useLessonSelection';
import { useLibraryActions, type LibraryActions } from './useLibraryActions';
import type { LibraryView } from './useLibraryView';

interface ManagedLibraryProps {
  view: LibraryView;
  openId: Id | null;
  onOpen: (folderId: Id | null) => void;
}

/** What the move dialog is for: the name for its title, and how to move what it stands for (one item, or a selection of lessons) to a place. */
interface Moving {
  item: MoveItem;
  name: string;
  move: (target: Id | null) => Promise<boolean>;
}

/** The folder being deleted, and the one after it, where focus goes once it is gone. */
interface Deleting {
  folder: LessonFolder;
  next: LessonFolder | undefined;
}

function ManagedContent({ view, openId, onOpen, actions, error }: ManagedLibraryProps & { actions: LibraryActions; error: string | null }) {
  const [moving, setMoving] = useState<Moving | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const request = useFocusRequest();
  const selection = useLessonSelection(openId, view.lessonsByFolder.get(openId) ?? []);
  const selectedIds = selection.selected.map((lesson) => lesson.id);
  const selectedFirst = selection.selected[0];
  const refocus = () => request(openId === null ? focusKey.library : focusKey.crumb);

  const moveTo = async (target: Id | null) => {
    if (moving && (await moving.move(target))) refocus();
  };

  const removeFolder = async ({ folder, next }: Deleting, withContent: boolean) => {
    if (await actions.removeFolder(folder.id, withContent)) request(next ? focusKey.open(next.id) : focusKey.newFolder);
  };

  const afterSuccess = async (done: Promise<boolean>) => {
    if (await done) refocus();
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
            actions={actions}
            onOpen={onOpen}
            onMove={() => {
              const item: MoveItem = { kind: 'folder', id: folder.id };
              setMoving({ item, name: folder.name, move: (target) => actions.move(item, target) });
            }}
            onDelete={() => setDeleting({ folder, next })}
          />
        )}
        afterFolders={<NewFolderTile parentId={openId} actions={actions} />}
        aboveLessons={
          <SelectionBar
            selection={selection}
            onPublish={(published) => void afterSuccess(actions.publishLessons(selectedIds, published))}
            onMove={() => {
              if (!selectedFirst) return;
              const item: MoveItem = { kind: 'lesson', id: selectedFirst.id, from: view.tree.folderOf(selectedFirst) };
              setMoving({ item, name: t.library.select.name(selectedIds.length), move: (target) => actions.moveLessons(selectedIds, target) });
            }}
            onRemove={() => void afterSuccess(actions.removeLessons(selectedIds))}
          />
        }
        renderLesson={(lesson) => {
          const from = view.tree.folderOf(lesson);
          const item: MoveItem = { kind: 'lesson', id: lesson.id, from };
          return (
            <LessonCard
              lesson={lesson}
              admin
              from={from}
              selection={{ selected: selection.isSelected(lesson), onChange: (on) => selection.select(lesson, on) }}
              onMove={() => setMoving({ item, name: lesson.title, move: (target) => actions.move(item, target) })}
            />
          );
        }}
      >
        {error && <p className="notice notice--bad">{error}</p>}
      </LibraryBrowser>
      {moving && <MoveDialog key={moving.item.id} tree={view.tree} item={moving.item} name={moving.name} onPick={(target) => void moveTo(target)} onClose={() => setMoving(null)} />}
      {deleting && (
        <DeleteFolderDialog
          key={deleting.folder.id}
          folder={deleting.folder}
          view={view}
          onConfirm={(withContent) => void removeFolder(deleting, withContent)}
          onClose={() => setDeleting(null)}
        />
      )}
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
