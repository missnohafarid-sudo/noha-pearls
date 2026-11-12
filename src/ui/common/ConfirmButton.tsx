import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../../i18n';

interface ConfirmButtonProps {
  onConfirm: () => void;
  className?: string;
  /** The full name for a screen reader, while the button shows a short word. */
  ariaLabel?: string;
  /** Said next to the button once it is armed: exactly what the second press will do. */
  consequence?: string;
  children: ReactNode;
}

/** A button for destructive actions: the first press arms it, the second within a few seconds confirms. */
export function ConfirmButton({ onConfirm, className = 'btn btn--danger', ariaLabel, consequence, children }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={armed ? undefined : ariaLabel}
        onClick={() => {
          if (armed) onConfirm();
          setArmed(!armed);
        }}
      >
        {armed ? t.common.confirm : children}
      </button>
      {consequence !== undefined && (
        <span role="status" className="confirm-note muted">
          {armed ? consequence : ''}
        </span>
      )}
    </>
  );
}
