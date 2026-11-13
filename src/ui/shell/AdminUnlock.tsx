import { useEffect, useRef, useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { PasswordField } from '../forms/PasswordField';
import { useServices } from '../ServicesContext';
import '../forms/forms.css';

/**
 * The teacher's sign-in prompt. The parent renders it only while it is open,
 * so every opening starts with empty fields; `onClose` tells the parent to stop rendering it.
 */
export function AdminUnlock({ onClose }: { onClose: () => void }) {
  const { auth } = useServices();
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [passwordShown, setPasswordShown] = useState(false);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'wrong'>('idle');
  /** Set once the prompt is closed, so the answer to an attempt made before that is ignored. */
  const closed = useRef(false);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const close = () => dialog.current?.close();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('checking');
    let signedIn = false;
    try {
      signedIn = await auth.signIn({ password, code });
    } catch {
      signedIn = false;
    }
    if (closed.current) return;
    if (signedIn) {
      close();
    } else {
      setCode('');
      setPasswordShown(false);
      setStatus('wrong');
    }
  };

  return (
    <dialog
      ref={dialog}
      className="dialog"
      onClose={() => {
        closed.current = true;
        onClose();
      }}
    >
      <form className="dialog__frame" onSubmit={submit}>
        <header className="dialog__head">
          <h2 className="dialog__title">{t.shell.unlock.title}</h2>
        </header>
        <div className="dialog__body stack">
          <PasswordField
            label={t.shell.unlock.password}
            value={password}
            onChange={setPassword}
            shown={passwordShown}
            onShownChange={setPasswordShown}
            autoFocus
          />
          <label className="field">
            <span className="field__label">{t.shell.unlock.code}</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <p className="muted form-status" role="status">
            {status === 'checking' ? t.shell.unlock.checking : status === 'wrong' ? t.shell.unlock.wrong : ''}
          </p>
        </div>
        <div className="dialog__foot row">
          <button type="submit" className="btn btn--primary" disabled={status === 'checking'}>
            {t.shell.unlock.submit}
          </button>
          <button type="button" className="btn" onClick={close}>
            {t.common.cancel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
