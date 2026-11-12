import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n';
import './overlay.css';

interface FullScreenOverlayProps {
  /** Names the dialog for assistive technology. */
  label: string;
  /** Shown large at the top. */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** The full-screen shell every overlay shares: dialog, title, close button and the Escape key. */
export function FullScreenOverlay({ label, title, onClose, children }: FullScreenOverlayProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={label}>
      <header className="overlay__top row row--between">
        <h2 className="overlay__title">{title}</h2>
        <button type="button" className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </header>
      {children}
    </div>
  );
}
