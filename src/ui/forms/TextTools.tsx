import { useId, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';
import { fractionEdit } from '../../domain/fractions';
import { hideSelection, insertStarterTable, type TextEdit } from '../../domain/slideText';
import { isolatedText, plainPosition, plainText, shownPosition } from '../../domain/textDirection';
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

/** Applies the edit a rule makes for the text of the box and its selection, in plain-text positions, and shows the result with the box's isolated pieces. */
function editText(control: Control, makeEdit: (text: string, start: number, end: number) => TextEdit | null): void {
  const shown = control.value;
  const text = plainText(shown);
  const edit = makeEdit(text, plainPosition(shown, control.selectionStart ?? 0), plainPosition(shown, control.selectionEnd ?? 0));
  if (!edit) return;
  const next = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  control.focus();
  control.setRangeText(isolatedText(next), 0, shown.length, 'preserve');
  control.setSelectionRange(shownPosition(next, edit.selectFrom), shownPosition(next, edit.selectTo));
  announce(control);
}

const hideSelected = (control: Control): void => editText(control, hideSelection);
const insertFraction = (control: Control): void => editText(control, fractionEdit);
const insertTable = (control: Control): void => editText(control, (text, start) => insertStarterTable(text, start, tt.tableHeaders));

/** A tools bar above an editing form: symbols to put at the caret of the box she was last in, and buttons that hide the lines she selected, or put a starter table, in a slide-text box. */
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
          <button type="button" className="btn btn--small" disabled={!live?.hasAttribute(SLIDE_TEXT_ATTRIBUTE)} onClick={() => live && insertTable(live)}>
            {tt.table}
          </button>
          <button type="button" className="btn btn--small" disabled={!live} onClick={() => live && insertFraction(live)}>
            {tt.fraction}
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
