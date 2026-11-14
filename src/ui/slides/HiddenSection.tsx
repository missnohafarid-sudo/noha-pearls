import { useId, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { HiddenControlProvider, SHOWN, useHiddenControl } from './hiddenControl';
import './hiddenSection.css';

/**
 * What is hidden in a bluish box, at position `part` of its slide. Without an outside control it keeps its own state and
 * button, and nothing is stored or sent; with one, the control says whether it is open and whether there is a button.
 */
export function HiddenSection({ part, children }: { part: number; children: ReactNode }) {
  const control = useHiddenControl();
  const [ownOpen, setOwnOpen] = useState(false);
  const boxId = useId();
  const open = control ? control.isOpen(part) : ownOpen;
  const toggle: ((part: number) => void) | null = control ? control.toggle : () => setOwnOpen(!ownOpen);
  return (
    <div className="slide-hidden">
      {toggle && (
        <button type="button" className="btn" aria-expanded={open} aria-controls={boxId} onClick={() => toggle(part)}>
          {open ? t.slides.view.hideHidden : t.slides.view.showHidden}
        </button>
      )}
      <div id={boxId} className="slide-hidden__box" hidden={!open}>
        <HiddenControlProvider value={control && SHOWN}>{children}</HiddenControlProvider>
      </div>
    </div>
  );
}
