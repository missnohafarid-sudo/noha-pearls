/** One stretch of a line: `ltr` marks a piece that must be drawn as one isolated left-to-right unit. */
export interface DirectedRun {
  text: string;
  ltr: boolean;
}

const ARABIC_CONTEXT = new RegExp('[\\u0590-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFC]', 'u');
const LETTER = '\\p{Script=Latin}\\p{Script=Greek}';
const DIGITS = '0-9\\u00B2\\u00B3\\u00B9\\u2070-\\u209F';
const SIGNS = "+\\-\\u2212\\u00D7\\u00F7*/=<>\\u2264\\u2265\\u2260\\u2248\\u00B1^_%\\u00B0\\u221A\\u221E\\u2192\\u2190\\u21CC\\u00B7'\\u2032\\u2033|";
const BRACKETS = '()\\[\\]{}';
const INNER_SEPARATORS = ' .,:';

const HAS_LETTER = new RegExp(`[${LETTER}]`, 'u');
const CANDIDATE = new RegExp(`[${LETTER}${DIGITS}${SIGNS}${BRACKETS}${INNER_SEPARATORS}]+`, 'gu');
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
