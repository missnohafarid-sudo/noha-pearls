import { useId, useState, type ChangeEvent } from 'react';
import { t } from '../../i18n';

interface FilePickerProps {
  /** The kinds of file the chooser offers, as an `accept` list. */
  accept: string;
  onFile: (file: File) => void;
}

/** Our own button that opens the file chooser, with the name of the chosen file beside it. The real file input stays inside the button, hidden from the eye only. */
export function FilePicker({ accept, onFile }: FilePickerProps) {
  const nameId = useId();
  const [name, setName] = useState<string | null>(null);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setName(file.name);
    onFile(file);
  };

  return (
    <span className="file-picker">
      <label className="btn btn--small file-picker__button">
        {t.common.chooseFile}
        <input className="visually-hidden" type="file" accept={accept} aria-describedby={nameId} onChange={pick} />
      </label>
      <span id={nameId} className="muted file-picker__name">
        {name ?? t.common.noFile}
      </span>
    </span>
  );
}
