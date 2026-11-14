/** One stretch of a line: `ltr` marks a piece that must be drawn as one isolated left-to-right unit. */
export interface DirectedRun {
  text: string;
  ltr: boolean;
}

const ARABIC_CONTEXT = new RegExp('[\\u0590-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFC]', 'u');
const LETTER = '\\p{Script=Latin}\\p{Script=Greek}';
const DIGITS = '0-9\\u00B2\\u00B3\\u00B9\\u2070-\\u209F';
const SIGNS = "+\\-\\u2212\\u00D7\\u00F7*/=<>\\u2264\\u2265\\u2260\\u2248\\u00B1^_%\\u00B0\\u221A\\u221E\\u2191\\u2192\\u2193\\u2190\\u21CC\\u00B7'\\u2032\\u2033|";
const BRACKETS = '()\\[\\]{}';
/** Stands in for a whole fraction while a line is split into runs, so the fraction is one part of the equation it sits in (see `lineRuns` in fractions.ts). */
export const FRACTION_MARK = '\uE000';
const INNER_SEPARATORS = ' .,:';
/** What holds an email or a web address together; without them it would be cut into pieces that swap places. */
const ADDRESS_MARKS = '@&#?~';

const HAS_LETTER = new RegExp(`[${LETTER}]`, 'u');
const CANDIDATE = new RegExp(`[${LETTER}${DIGITS}${SIGNS}${BRACKETS}${FRACTION_MARK}${INNER_SEPARATORS}${ADDRESS_MARKS}]+`, 'gu');
const EQUATION_SIGN = new RegExp('[=+\\u00D7\\u00F7*^<>\\u2264\\u2265\\u2260\\u2248\\u00B1\\u221A]', 'u');
const SIGNED_NUMBER = new RegExp('^[-\\u2212+]\\d+(?:[.,]\\d+)?$', 'u');
const EDGE_PUNCTUATION = /[ .,:;!?]/;
const PARTNER: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const OPENER: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** The part of a stretch that is drawn left to right: edge spaces and sentence marks, and brackets without a partner inside, fall outside. */
function trimmedBounds(stretch: string): [number, number] {
  let start = 0;
  let end = stretch.length;
  for (let moved = true; moved; ) {
    moved = false;
    if (start < end) {
      const first = stretch[start];
      if (EDGE_PUNCTUATION.test(first) || (first in PARTNER && !stretch.slice(start + 1, end).includes(PARTNER[first]))) {
        start += 1;
        moved = true;
      }
    }
    if (start < end) {
      const last = stretch[end - 1];
      if (EDGE_PUNCTUATION.test(last) || (last in OPENER && !stretch.slice(start, end - 1).includes(OPENER[last]))) {
        end -= 1;
        moved = true;
      }
    }
  }
  return [start, end];
}

const needsIsolation = (piece: string): boolean => HAS_LETTER.test(piece) || EQUATION_SIGN.test(piece) || SIGNED_NUMBER.test(piece);

/** Splits one line into consecutive runs (their texts joined give the line back) so an equation or English word inside Arabic keeps its own order. */
export function directedRuns(line: string): DirectedRun[] {
  if (line === '') return [];
  if (!ARABIC_CONTEXT.test(line) && HAS_LETTER.test(line)) return [{ text: line, ltr: true }];
  const runs: DirectedRun[] = [];
  let cursor = 0;
  for (const match of line.matchAll(CANDIDATE)) {
    const [from, to] = trimmedBounds(match[0]);
    const piece = match[0].slice(from, to);
    if (piece === '' || !needsIsolation(piece)) continue;
    const begin = match.index + from;
    if (begin > cursor) runs.push({ text: line.slice(cursor, begin), ltr: false });
    runs.push({ text: piece, ltr: true });
    cursor = begin + piece.length;
  }
  if (cursor < line.length) runs.push({ text: line.slice(cursor), ltr: false });
  return runs;
}

const ISOLATE_OPEN = '⁦';
const ISOLATE_CLOSE = '⁩';
const ISOLATE_MARKS = new RegExp(`[${ISOLATE_OPEN}${ISOLATE_CLOSE}]`, 'gu');
const LINES_AND_BREAKS = /(\r?\n)/;

/** Where each left-to-right piece of a text sits, as [start, end) positions in the text; a line without Arabic or without such a piece has none. */
function directedPieces(text: string): [number, number][] {
  const pieces: [number, number][] = [];
  let offset = 0;
  for (const part of text.split(LINES_AND_BREAKS)) {
    if (ARABIC_CONTEXT.test(part)) {
      const runs = directedRuns(part);
      let at = offset;
      for (const run of runs) {
        if (run.ltr) pieces.push([at, at + run.text.length]);
        at += run.text.length;
      }
    }
    offset += part.length;
  }
  return pieces;
}

/** The text as a plain box should show it: every left-to-right piece inside Arabic is fenced by isolate marks so the box keeps its order. */
export function isolatedText(text: string): string {
  let shown = '';
  let cursor = 0;
  for (const [start, end] of directedPieces(text)) {
    shown += `${text.slice(cursor, start)}${ISOLATE_OPEN}${text.slice(start, end)}${ISOLATE_CLOSE}`;
    cursor = end;
  }
  return shown + text.slice(cursor);
}

/** What a box shows, without the isolate marks: the text that is saved. */
export function plainText(shown: string): string {
  return shown.replace(ISOLATE_MARKS, '');
}

/** A caret position in the box's text, as a position in the saved text. */
export function plainPosition(shown: string, position: number): number {
  return plainText(shown.slice(0, position)).length;
}

/** A caret position in the saved text, as a position in the box's text: at the start of a piece it stays before the opening mark, at the end it moves after the closing one. */
export function shownPosition(text: string, position: number): number {
  let shown = position;
  for (const [start, end] of directedPieces(text)) {
    if (position > start) shown += 1;
    if (position >= end) shown += 1;
  }
  return shown;
}
