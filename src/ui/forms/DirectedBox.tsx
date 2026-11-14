import { useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type CompositionEvent, type HTMLAttributes, type RefObject } from 'react';
import { deleteBesideMarks, isolatedText, plainPosition, plainText, shownPosition, type DeletionDirection } from '../../domain/textDirection';

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

const DELETIONS: Record<string, DeletionDirection> = { deleteContentBackward: 'backward', deleteContentForward: 'forward' };

interface PendingCaret {
  text: string;
  start: number;
  end: number;
}

/**
 * A text box that shows an equation or an English piece inside Arabic in its own order, as the slide does,
 * by fencing it with isolate marks. The marks stay in the box: `onChange` gets the plain text,
 * and the caret is put back where it was in the plain text after the box is drawn again.
 * A deletion that removed only a mark deletes the character beside it instead; while a composition runs the box shows what it holds;
 * copying and cutting put the plain text on the clipboard.
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

  const [composing, setComposing] = useState<string | null>(null);

  const commit = (shown: string, start: number, end: number) => {
    const text = plainText(shown);
    pending.current = { text, start: plainPosition(shown, start), end: plainPosition(shown, end) };
    onChange(text);
  };

  const handleChange = (event: ChangeEvent<Control>) => {
    const control = event.target;
    const shown = control.value;
    const start = control.selectionStart ?? shown.length;
    const end = control.selectionEnd ?? shown.length;
    if (composing !== null) setComposing(shown);
    const direction = DELETIONS[(event.nativeEvent as Partial<InputEvent>).inputType ?? ''];
    if (direction && start === end && plainText(shown) === value) {
      const edit = deleteBesideMarks(value, plainPosition(shown, start), direction);
      pending.current = { text: edit.text, start: edit.caret, end: edit.caret };
      onChange(edit.text);
      return;
    }
    commit(shown, start, end);
  };

  const handleCompositionEnd = (event: CompositionEvent<Control>) => {
    const control = event.currentTarget;
    setComposing(null);
    commit(control.value, control.selectionStart ?? control.value.length, control.selectionEnd ?? control.value.length);
  };

  const copySelection = (event: ClipboardEvent<Control>, cut: boolean) => {
    const control = event.currentTarget;
    const start = control.selectionStart ?? 0;
    const end = control.selectionEnd ?? 0;
    if (start === end) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', plainText(control.value.slice(start, end)));
    if (cut) commit(control.value.slice(0, start) + control.value.slice(end), start, start);
  };

  const shownValue = ltr ? value : (composing ?? isolatedText(value));
  const props = {
    ...rest,
    dir: ltr ? 'ltr' : rest.dir,
    value: shownValue,
    onChange: handleChange,
    onCompositionStart: (event: CompositionEvent<Control>) => setComposing(event.currentTarget.value),
    onCompositionEnd: handleCompositionEnd,
    onCopy: (event: ClipboardEvent<Control>) => copySelection(event, false),
    onCut: (event: ClipboardEvent<Control>) => copySelection(event, true),
  };
  return multiline ? <textarea ref={box as RefObject<HTMLTextAreaElement>} {...props} /> : <input ref={box as RefObject<HTMLInputElement>} {...props} />;
}
