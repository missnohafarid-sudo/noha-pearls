import { useRef } from 'react';
import { t } from '../../i18n';

interface InPlaceNameProps {
  initial: string;
  /** Called with the cleaned name when it is new and not empty; `byKey` is false when she left the field with the pointer. */
  onCommit: (name: string, byKey: boolean) => void;
  onCancel: (byKey: boolean) => void;
}

/** A name typed where it will stay: Enter or leaving the field keeps it, Escape or an empty or unchanged name does nothing. */
export function InPlaceName({ initial, onCommit, onCancel }: InPlaceNameProps) {
  const finished = useRef(false);

  const finish = (typed: string, keep: boolean, byKey: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const name = typed.trim();
    if (keep && name !== '' && name !== initial) onCommit(name, byKey);
    else onCancel(byKey);
  };

  return (
    <input
      className="input in-place-name"
      defaultValue={initial}
      placeholder={t.library.newFolderPlaceholder}
      aria-label={t.library.folderNameLabel}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => finish(event.currentTarget.value, true, false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(event.currentTarget.value, true, true);
        }
        else if (event.key === 'Escape') finish('', false, true);
      }}
    />
  );
}
