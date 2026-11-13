import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { Checkbox } from '../forms/Checkbox';
import type { LessonSelection } from './useLessonSelection';

const ts = t.library.select;

interface SelectionBarProps {
  selection: LessonSelection;
  onPublish: (published: boolean) => void;
  onMove: () => void;
  onRemove: () => void;
}

/** Above the lessons of the open folder: select them all, and act on the selected ones together. */
export function SelectionBar({ selection, onPublish, onMove, onRemove }: SelectionBarProps) {
  const { selected } = selection;
  return (
    <div className="row selection-bar">
      <Checkbox checked={selection.allSelected} onChange={selection.selectAll} label={ts.all} />
      {selected.length > 0 && (
        <>
          <span className="muted" role="status">
            {ts.count(selected.length)}
          </span>
          {selected.some((lesson) => !lesson.published) && (
            <button type="button" className="btn btn--small" onClick={() => onPublish(true)}>
              {ts.publish}
            </button>
          )}
          {selected.some((lesson) => lesson.published) && (
            <button type="button" className="btn btn--small" onClick={() => onPublish(false)}>
              {ts.unpublish}
            </button>
          )}
          <button type="button" className="btn btn--small" onClick={onMove}>
            {t.library.moveWord}
          </button>
          <ConfirmButton className="btn btn--small btn--danger" consequence={ts.deleteConfirm(selected.length)} onConfirm={onRemove}>
            {t.common.remove}
          </ConfirmButton>
        </>
      )}
    </div>
  );
}
