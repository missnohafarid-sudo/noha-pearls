import { Fragment, useState } from 'react';
import type { Id } from '../../domain/models';
import type { ImportMode } from '../../domain/rosterFormat';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { downloadText } from '../common/downloadText';
import { FilePicker } from '../forms/FilePicker';
import { useServices } from '../ServicesContext';
import { AdminPanel } from '../shell/AdminPanel';

const tr = t.roster.import;

/** Brings a whole class in from pasted or uploaded text, and takes the list out as text. */
export function RosterImportPanel({ classId }: { classId: Id }) {
  const { roster } = useServices();
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);

  const changeText = (next: string) => {
    setText(next);
    setIssues([]);
    setDone(null);
  };

  const readFile = (file: File) => {
    setFileError(false);
    file.text().then(changeText, () => setFileError(true));
  };

  const submit = async (mode: ImportMode) => {
    const result = await roster.importFromText(classId, text, mode);
    if (result.ok) {
      changeText('');
      setDone(t.roster.describeChanges(result.changes));
    } else {
      setIssues(result.issues.map((issue) => t.roster.describeIssue(issue)));
    }
  };

  const exportList = async () => downloadText(tr.exportFile, await roster.exportToText(classId, tr.fileHeader), 'text/plain');

  return (
    <AdminPanel title={tr.title}>
      <div className="stack">
        <p className="muted">{tr.help1}</p>
        <p className="muted">{tr.help2}</p>
        <p className="muted" dir="auto">
          {tr.exampleLabel}
          {tr.exampleLines.map((line) => (
            <Fragment key={line}>
              <br />
              {line}
            </Fragment>
          ))}
        </p>
        <textarea className="input" rows={8} dir="auto" aria-label={tr.pasteLabel} value={text} onChange={(event) => changeText(event.target.value)} />
        <div className="row">
          <span className="muted">{tr.orFile}</span>
          <FilePicker accept=".txt,.csv,.tsv" onFile={readFile} />
        </div>
        {fileError && <p className="notice notice--bad">{tr.fileReadError}</p>}
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={text.trim() === ''} onClick={() => void submit('merge')}>
            {tr.addButton}
          </button>
          <ConfirmButton onConfirm={() => void submit('replace')}>{tr.replaceButton}</ConfirmButton>
        </div>
        <p className="muted">{tr.replaceHelp}</p>
        {done && <p className="notice">{done}</p>}
        {issues.length > 0 && (
          <div className="notice notice--bad stack stack--tight">
            <strong>{tr.errorsTitle}</strong>
            <ul>
              {issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="btn btn--small" onClick={() => void exportList()}>
          {tr.exportButton}
        </button>
      </div>
    </AdminPanel>
  );
}
