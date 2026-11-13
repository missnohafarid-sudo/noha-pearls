import { useId, useState } from 'react';
import { t } from '../../i18n';
import { BodyText } from './BodyText';

/** A button that opens and closes the slide's hidden text in a bluish box. Each screen keeps its own state; nothing is stored or sent. */
export function HiddenSection({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const boxId = useId();
  if (text.trim() === '') return null;
  return (
    <div className="slide-hidden">
      <button type="button" className="btn" aria-expanded={open} aria-controls={boxId} onClick={() => setOpen(!open)}>
        {open ? t.slides.view.hideHidden : t.slides.view.showHidden}
      </button>
      <div id={boxId} className="slide-hidden__box" hidden={!open}>
        <BodyText text={text} />
      </div>
    </div>
  );
}
