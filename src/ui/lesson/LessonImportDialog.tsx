import { useEffect, useRef, useState } from 'react';
import type { ImportIssue } from '../../domain/lessonFormat';
import { t } from '../../i18n';
import { copyText } from '../common/clipboard';
import { FilePicker } from '../forms/FilePicker';
import { navigate } from '../routing/routes';
import { useServices } from '../ServicesContext';

const tl = t.lesson.import;

/** A short-lived "copied" flag next to a copy button. */
function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void copyText(text).then((ok) => {
      setCopied(ok);
      if (ok) window.setTimeout(() => setCopied(false), 2500);
    });
  };
  return [copied, copy];
}

/** Three-step dialog that turns an AI assistant's reply into a lesson. Mount it to open it. */
export function LessonImportDialog({ onClose }: { onClose: () => void }) {
  const { lessons } = useServices();
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [fileError, setFileError] = useState(false);
  const [promptCopied, copyPrompt] = useCopy();
  const [errorsCopied, copyErrors] = useCopy();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const changeText = (next: string) => {
    setText(next);
    setIssues([]);
  };

  const readFile = (file: File) => {
    setFileError(false);
    file.text().then(changeText, () => setFileError(true));
  };

  const submit = async () => {
    const result = await lessons.importFromText(text);
    if (result.ok) {
      onClose();
      navigate({ name: 'lesson', lessonId: result.lesson.id, slideIndex: 0 });
    } else {
      setIssues(result.issues.map((issue: ImportIssue) => t.lessonFile.describeIssue(issue)));
    }
  };

  return (
    <dialog ref={dialog} className="dialog dialog--wide" onClose={onClose}>
      <div className="stack">
        <h2 className="dialog__title">{tl.title}</h2>

        <section className="stack stack--tight">
          <h3>{tl.step1Title}</h3>
          <p className="muted">{tl.step1Help}</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => copyPrompt(t.lessonPrompt.build())}>
              {tl.copyInstructions}
            </button>
            {promptCopied && <span className="chip chip--ok">{t.common.copied}</span>}
          </div>
        </section>

        <section className="stack stack--tight">
          <h3>{tl.step2Title}</h3>
          <p className="muted">{tl.step2Help}</p>
          <textarea
            className="input"
            rows={8}
            dir="ltr"
            aria-label={tl.pasteLabel}
            value={text}
            onChange={(event) => changeText(event.target.value)}
          />
          <div className="row">
            <span className="muted">{tl.orFile}</span>
            <FilePicker accept=".json,.txt" onFile={readFile} />
          </div>
          {fileError && <p className="notice notice--bad">{tl.fileReadError}</p>}
        </section>

        <section className="stack stack--tight">
          <h3>{tl.step3Title}</h3>
          <p className="muted">{tl.step3Help}</p>
          <p className="notice">{tl.verseNotice}</p>
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={text.trim() === ''} onClick={() => void submit()}>
              {tl.importButton}
            </button>
          </div>
          {issues.length > 0 && (
            <div className="notice notice--bad stack stack--tight">
              <strong>{tl.errorsTitle}</strong>
              <ul>
                {issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
              <div className="row">
                <button type="button" className="btn btn--small" onClick={() => copyErrors(`${t.lessonFile.fixRequest}\n${issues.join('\n')}`)}>
                  {tl.copyErrors}
                </button>
                {errorsCopied && <span className="chip chip--ok">{t.common.copied}</span>}
              </div>
            </div>
          )}
        </section>

        <div className="row">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            {t.common.close}
          </button>
        </div>
      </div>
    </dialog>
  );
}
