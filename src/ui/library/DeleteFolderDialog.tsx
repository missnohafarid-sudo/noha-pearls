import { useEffect, useRef, useState } from 'react';
import type { LessonFolder } from '../../domain/models';
import { t } from '../../i18n';
import { Checkbox } from '../forms/Checkbox';
import type { LibraryView } from './useLibraryView';

const td = t.library.deleteDialog;

interface DeleteFolderDialogProps {
  folder: LessonFolder;
  view: LibraryView;
  onConfirm: (withContent: boolean) => void;
  onClose: () => void;
}

/** Asks what deleting a folder should do with what is inside it. Mount it to open it; it closes itself, so focus goes back to what opened it. */
export function DeleteFolderDialog({ folder, view, onConfirm, onClose }: DeleteFolderDialogProps) {
  const parentId = view.tree.parentOf(folder.id);
  const parentName = parentId === null ? null : (view.tree.get(parentId)?.name ?? null);
  const folderCount = view.tree.within(folder.id).size;
  const lessonCount = view.counts.get(folder.id) ?? 0;
  const hasContent = folderCount > 0 || lessonCount > 0;
  const keeps = td.keeps(view.tree.children(folder.id).length, view.lessonsByFolder.get(folder.id)?.length ?? 0, parentName);
  const loses = td.loses(folderCount, lessonCount);
  const dialog = useRef<HTMLDialogElement>(null);
  const [withContent, setWithContent] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const close = () => dialog.current?.close();
  const confirm = () => {
    close();
    onConfirm(hasContent && withContent);
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <div className="dialog__frame">
        <header className="dialog__head">
          <h2 className="dialog__title">{t.library.deleteFolder(folder.name)}</h2>
        </header>
        <div className="dialog__body stack">
          {hasContent && <Checkbox checked={withContent} onChange={setWithContent} label={td.withContent} />}
          <p role="status">{hasContent && withContent ? loses : keeps}</p>
        </div>
        <div className="dialog__foot row">
          <button type="button" className="btn btn--danger" onClick={confirm}>
            {t.common.remove}
          </button>
          <button type="button" className="btn" onClick={close}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
