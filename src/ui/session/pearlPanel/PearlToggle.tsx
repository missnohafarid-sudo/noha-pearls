import { forwardRef } from 'react';
import { t } from '../../../i18n';
import { PEARL_PANEL_ID } from './panelId';
import { PearlIcon } from './PearlIcon';
import './pearlPanel.css';

interface Props {
  open: boolean;
  /** How many have not answered the question on screen; 0 when there is none or all have. */
  waiting: number;
  onToggle: () => void;
}

/** The round pearl button: opens and closes the panel of groups and hearts. */
export const PearlToggle = forwardRef<HTMLButtonElement, Props>(function PearlToggle({ open, waiting, onToggle }, ref) {
  return (
    <button ref={ref} type="button" className="btn pearl-toggle" aria-label={t.pearlPanel.toggle(waiting)} aria-expanded={open} aria-controls={PEARL_PANEL_ID} onClick={onToggle}>
      <PearlIcon />
      {waiting > 0 && <span className="chip chip--accent pearl-toggle__count">{waiting}</span>}
    </button>
  );
});
