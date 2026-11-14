import { useId, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { hideSelection } from '../../domain/slideText';
import { SYMBOL_GROUPS } from '../../domain/symbols';
import { t } from '../../i18n';
import { SLIDE_TEXT_ATTRIBUTE } from './SchemaForm';
import './textTools.css';

type Control = HTMLInputElement | HTMLTextAreaElement;

const tt = t.slides.tools;

const isTextControl = (element: EventTarget): element is Control =>
  element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && element.type === 'text' && element.getAttribute('role') !== 'spinbutton');

/** Tells the form it changed, the way typing does, so its own change handler runs. */
function announce(control: Control): void {
  control.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertSymbol(control: Control, symbol: string): void {
  control.focus();
  control.setRangeText(symbol, control.selectionStart ?? control.value.length, control.selectionEnd ?? control.value.length, 'end');
  announce(control);
}

function hideSelected(control: Control): void {
  const edit = hideSelection(control.value, control.selectionStart ?? 0, control.selectionEnd ?? 0);
  if (!edit) return;
  control.focus();
  control.setRangeText(edit.insert, edit.from, edit.to, 'preserve');
  announce(control);
  control.setSelectionRange(edit.selectFrom, edit.selectTo);
}

/** A tools bar above an editing form: symbols to put at the caret of the box she was last in, and a button that hides the lines she selected in a slide-text box. */
export function TextTools({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Control | null>(null);
  const [open, setOpen] = useState(false);
  const paletteId = useId();
  const remember = (event: FocusEvent) => {
    if (isTextControl(event.target)) setTarget(event.target);
  };
  const keepFocus = (event: PointerEvent) => event.preventDefault();
  const live = target !== null && target.isConnected ? target : null;
  return (
    <div className="text-tools" onFocusCapture={remember}>
      <div className="text-tools__tools" onPointerDown={keepFocus}>
        <div className="text-tools__bar">
          <button type="button" className="btn btn--small" aria-expanded={open} aria-controls={paletteId} onClick={() => setOpen(!open)}>
            {tt.symbols}
          </button>
          <button type="button" className="btn btn--small" disabled={!live?.hasAttribute(SLIDE_TEXT_ATTRIBUTE)} onClick={() => live && hideSelected(live)}>
            {tt.hide}
          </button>
          {!live && <span className="field__hint">{tt.hint}</span>}
        </div>
        <div id={paletteId} className="text-tools__palette" hidden={!open}>
          {SYMBOL_GROUPS.map((group) => (
            <div key={group.id} role="group" aria-label={tt.group[group.id]} className="text-tools__group">
              <span className="field__label">{tt.group[group.id]}</span>
              <div className="text-tools__symbols" dir="ltr">
                {group.symbols.map((symbol) => (
                  <button key={symbol} type="button" className="btn btn--small" disabled={!live} onClick={() => live && insertSymbol(live, symbol)}>
                    {symbol}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
