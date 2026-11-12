import type { FolderTree } from '../../domain/folders';
import type { Id } from '../../domain/models';
import { t } from '../../i18n';
import { focusKey, useFocusTarget } from './focus';
import { useDropTarget } from './useDragMove';

interface CrumbProps {
  /** The folder this crumb opens; null is the top level. */
  target: Id | null;
  label: string;
  current: boolean;
  onOpen: (folderId: Id | null) => void;
}

function Crumb({ target, label, current, onOpen }: CrumbProps) {
  const drop = useDropTarget(target);
  const ref = useFocusTarget<HTMLButtonElement>(current ? focusKey.crumb : null);
  return (
    <li className={`path__crumb${drop.highlighted ? ' is-drop' : ''}`} {...drop.props}>
      <button type="button" ref={ref} className="path__button" aria-current={current ? 'page' : undefined} onClick={() => onOpen(target)}>
        {label}
      </button>
    </li>
  );
}

/** Where the open folder is: the top level, then each folder down to it. Each one opens that place. */
export function PathLine({ tree, openId, onOpen }: { tree: FolderTree; openId: Id | null; onOpen: (folderId: Id | null) => void }) {
  return (
    <nav aria-label={t.library.pathLabel}>
      <ol className="list-reset path">
        <Crumb target={null} label={t.library.rootName} current={openId === null} onOpen={onOpen} />
        {tree.path(openId).map((folder) => (
          <Crumb key={folder.id} target={folder.id} label={folder.name} current={folder.id === openId} onOpen={onOpen} />
        ))}
      </ol>
    </nav>
  );
}
