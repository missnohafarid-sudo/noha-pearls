import { useId } from 'react';
import { t } from '../../i18n';
import './passwordField.css';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  shown: boolean;
  onShownChange: (shown: boolean) => void;
  autoFocus?: boolean;
}

/** An eye when the password is hidden, the same eye crossed out when it is shown. */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  );
}

/** Our own password field: the input and, inside its end, a button that shows or hides what was typed. The browser's own reveal icon is hidden so there is never a second one. */
export function PasswordField({ label, value, onChange, shown, onShownChange, autoFocus = false }: PasswordFieldProps) {
  const inputId = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="password-field">
        <input
          id={inputId}
          className="input password-field__input"
          type={shown ? 'text' : 'password'}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-field__toggle"
          aria-pressed={shown}
          aria-label={shown ? t.common.hidePassword : t.common.showPassword}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onShownChange(!shown)}
        >
          <EyeIcon crossed={shown} />
        </button>
      </div>
    </div>
  );
}
