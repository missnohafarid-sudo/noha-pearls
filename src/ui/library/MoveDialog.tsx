import { useEffect, useRef } from 'react';
import type { FolderTree, MoveItem } from '../../domain/folders';
import type { Id } from '../../domain/models';
import { t } from '../../i18n';

const tm = t.library.move;

interface DestinationsProps {
  tree: FolderTree;
  item: MoveItem;
  parentId: Id | null;
  onPick: (target: Id | null) => void;
}

function Destination({ tree, item, target, name, onPick }: Omit<DestinationsProps, 'parentId'> & { target: Id | null; name: string }) {
  const problem = tree.placeProblem(item, target);
  return (
    <li>
      <button type="button" className="btn move-list__button" disabled={problem !== null} aria-current={problem === 'here' ? 'location' : undefined} onClick={() => onPick(target)}>
        {name}
      </button>
      {problem && <span className="muted">{tm.problem[problem]}</span>}
      <Destinations tree={tree} item={item} parentId={target} onPick={onPick} />
    </li>
  );
}

/** The folders under one place, each with its own folders nested beneath it. */
function Destinations({ tree, item, parentId, onPick }: DestinationsProps) {
  const folders = tree.children(parentId);
  if (folders.length === 0) return null;
  return (
    <ul className="list-reset move-list">
      {folders.map((folder) => (
        <Destination key={folder.id} tree={tree} item={item} target={folder.id} name={folder.name} onPick={onPick} />
      ))}
    </ul>
  );
}

interface MoveDialogProps {
  tree: FolderTree;
  item: MoveItem;
  /** The name of what is being moved, for the title. */
  name: string;
  onPick: (target: Id | null) => void;
  onClose: () => void;
}

/** Every place the item could go, as the tree itself; the keyboard and touch way to move things. Mount it to open it; it closes itself, so focus goes back to what opened it. */
export function MoveDialog({ tree, item, name, onPick, onClose }: MoveDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const close = () => dialog.current?.close();
  const choose = (target: Id | null) => {
    close();
    onPick(target);
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <div className="dialog__frame">
        <header className="dialog__head">
          <h2 className="dialog__title">{tm.title(name)}</h2>
        </header>
        <div className="dialog__body">
          <ul className="list-reset move-list move-list--root">
            <Destination tree={tree} item={item} target={null} name={t.library.rootName} onPick={choose} />
          </ul>
        </div>
        <div className="dialog__foot row">
          <button type="button" className="btn" onClick={close}>
            {t.common.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
