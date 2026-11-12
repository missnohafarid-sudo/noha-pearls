import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../../i18n';

/** A button for destructive actions: the first press arms it, the second within a few seconds confirms. */
export function ConfirmButton({ onConfirm, className = 'btn btn--danger', children }: { onConfirm: () => void; className?: string; children: ReactNode }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (armed) onConfirm();
        setArmed(!armed);
      }}
    >
      {armed ? t.common.confirm : children}
    </button>
  );
}
