import { useId, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import './hiddenSection.css';

/** A button that opens and closes what is hidden in a bluish box. Each screen keeps its own state; nothing is stored or sent. */
export function HiddenSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const boxId = useId();
  return (
    <div className="slide-hidden">
      <button type="button" className="btn" aria-expanded={open} aria-controls={boxId} onClick={() => setOpen(!open)}>
        {open ? t.slides.view.hideHidden : t.slides.view.showHidden}
      </button>
      <div id={boxId} className="slide-hidden__box" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
