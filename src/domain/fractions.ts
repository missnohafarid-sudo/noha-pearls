import type { TextEdit } from './slideText';
import { directedRuns, FRACTION_MARK } from './textDirection';

/** A fraction written as `{top/bottom}`. */
export interface Fraction {
  top: string;
  bottom: string;
}

/** A stretch of a drawn line: a piece of text or a fraction. */
export type LinePart = string | Fraction;

/** Consecutive parts of one line that are drawn together; `ltr` marks a run that must be isolated left to right. */
export interface LineRun {
  ltr: boolean;
  parts: LinePart[];
}

const FRACTION = /\{([^{}/\r\n]*)\/([^{}/\r\n]*)\}/g;
const NOT_FRACTION_TEXT = /[{}\r\n]/;

/** Splits one line into runs as `directedRuns` does, with each `{top/bottom}` a single part of the run it sits in: an equation keeps its fraction in place. */
export function lineRuns(line: string): LineRun[] {
  const fractions: Fraction[] = [];
  const masked = line.replaceAll(FRACTION_MARK, '').replace(FRACTION, (written, top: string, bottom: string) => {
    if (top.trim() === '' || bottom.trim() === '') return written;
    fractions.push({ top: top.trim(), bottom: bottom.trim() });
    return FRACTION_MARK;
  });
  let used = 0;
  return directedRuns(masked).map(({ text, ltr }) => ({
    ltr,
    parts: text
      .split(FRACTION_MARK)
      .flatMap((piece, index): LinePart[] => (index === 0 ? [piece] : [fractions[used++], piece]))
      .filter((part) => part !== ''),
  }));
}

/**
 * The edit for the fraction tool. A selection with exactly one slash and no brace or line break is wrapped in braces, caret after them;
 * anything else gets `{/}` after the selection, with the caret between the brace and the slash.
 */
export function fractionEdit(text: string, start: number, end: number): TextEdit {
  const first = Math.max(0, Math.min(start, end, text.length));
  const last = Math.max(0, Math.min(Math.max(start, end), text.length));
  const selected = text.slice(first, last);
  if (selected.split('/').length === 2 && !NOT_FRACTION_TEXT.test(selected)) {
    const written = `{${selected}}`;
    const caret = first + written.length;
    return { from: first, to: last, insert: written, selectFrom: caret, selectTo: caret };
  }
  const caret = last + 1;
  return { from: last, to: last, insert: '{/}', selectFrom: caret, selectTo: caret };
}
