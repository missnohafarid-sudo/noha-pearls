import { useLayoutEffect, useRef, type ChangeEvent, type HTMLAttributes, type RefObject } from 'react';
import { isolatedText, plainPosition, plainText, shownPosition } from '../../domain/textDirection';

type Control = HTMLInputElement | HTMLTextAreaElement;

interface DirectedBoxProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  /** The saved text: it never carries the isolate marks the box shows. */
  value: string;
  onChange: (text: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  /** An address or a code: shown as it is, left to right. */
  ltr?: boolean;
}

interface PendingCaret {
  text: string;
  start: number;
  end: number;
}

/**
 * A text box that shows an equation or an English piece inside Arabic in its own order, as the slide does,
 * by fencing it with isolate marks. The marks stay in the box: `onChange` gets the plain text,
 * and the caret is put back where it was in the plain text after the box is drawn again.
 */
export function DirectedBox({ value, onChange, multiline, ltr, ...rest }: DirectedBoxProps) {
  const box = useRef<Control>(null);
  const pending = useRef<PendingCaret | null>(null);

  useLayoutEffect(() => {
    const caret = pending.current;
    pending.current = null;
    const control = box.current;
    if (ltr || !caret || !control || caret.text !== value || document.activeElement !== control) return;
    control.setSelectionRange(shownPosition(value, caret.start), shownPosition(value, caret.end));
  });

  const handleChange = (event: ChangeEvent<Control>) => {
    const control = event.target;
    const shown = control.value;
    const text = plainText(shown);
    pending.current = {
      text,
      start: plainPosition(shown, control.selectionStart ?? shown.length),
      end: plainPosition(shown, control.selectionEnd ?? shown.length),
    };
    onChange(text);
  };

  const props = { ...rest, dir: ltr ? 'ltr' : rest.dir, value: ltr ? value : isolatedText(value), onChange: handleChange };
  return multiline ? <textarea ref={box as RefObject<HTMLTextAreaElement>} {...props} /> : <input ref={box as RefObject<HTMLInputElement>} {...props} />;
}
