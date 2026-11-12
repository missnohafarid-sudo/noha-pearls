import type { ReactNode } from 'react';
import type { LessonFolder } from '../../domain/models';
import { t } from '../../i18n';
import { FolderIcon } from './FolderIcon';
import { focusKey, useFocusTarget } from './focus';
import { useDragSource, useDropTarget } from './useDragMove';

const tl = t.library;

interface FolderTileProps {
  folder: LessonFolder;
  /** How many lessons it holds, at any depth. */
  holds: number;
  onOpen: (folderId: string) => void;
  /** A field shown instead of the folder's name and open button, while its name is being typed. */
  nameField?: ReactNode;
  /** The tile's own actions, under it. */
  children?: ReactNode;
}

/** One folder: a drawn folder, its name and how many lessons it holds; pressing it opens it. Inside a drag provider it is also dragged and dropped on. */
export function FolderTile({ folder, holds, onOpen, nameField, children }: FolderTileProps) {
  const { props: source, dragging } = useDragSource({ kind: 'folder', id: folder.id }, !nameField);
  const drop = useDropTarget(folder.id);
  const openRef = useFocusTarget<HTMLButtonElement>(focusKey.open(folder.id));
  const holding = tl.holds(holds);

  return (
    <div className={`folder-tile${drop.highlighted ? ' is-drop' : ''}${dragging ? ' is-dragging' : ''}`} {...source} {...drop.props}>
      {nameField ?? (
        <button type="button" ref={openRef} className="folder-tile__open" aria-label={tl.folderLabel(folder.name, holding)} onClick={() => onOpen(folder.id)}>
          <FolderIcon />
          <span className="folder-tile__name">{folder.name}</span>
          <span className="chip">{holding}</span>
        </button>
      )}
      {children}
    </div>
  );
}
