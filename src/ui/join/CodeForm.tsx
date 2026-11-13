import { useState, type FormEvent } from 'react';
import { normalizeJoinCode } from '../../domain/ids';
import { t } from '../../i18n';

/** The field where a code is typed, with the words of its button; hands the code on in its normal form. */
export function CodeForm({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: (code: string) => void }) {
  const [typed, setTyped] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(normalizeJoinCode(typed));
  };

  return (
    <form className="join-code row" onSubmit={submit}>
      <label className="field field--inline">
        <span className="field__label">{t.session.joinCode}</span>
        <input
          className="input"
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      <button type="submit" className="btn btn--primary">
        {submitLabel}
      </button>
    </form>
  );
}
