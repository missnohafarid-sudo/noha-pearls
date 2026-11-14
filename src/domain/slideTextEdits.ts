import { HIDDEN_FENCE, isFence } from './slideText';
import { starterTable } from './slideTable';

/** A change to a text: replace `from` to `to` with `insert`, then select `selectFrom` to `selectTo` of the new text. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
  selectFrom: number;
  selectTo: number;
}

const FENCE_LINE = `${HIDDEN_FENCE}\n`;

interface Row {
  start: number;
  end: number;
  fence: boolean;
}

/** A hidden part as the rows from its opening fence to its closing fence, or to the last row when it is never closed. */
interface Span {
  first: number;
  last: number;
}

function rowsOf(text: string): Row[] {
  const rows: Row[] = [];
  let start = 0;
  for (;;) {
    const found = text.indexOf('\n', start);
    const end = found === -1 ? text.length : found;
    rows.push({ start, end, fence: isFence(text.slice(start, end)) });
    if (found === -1) return rows;
    start = found + 1;
  }
}

function hiddenSpans(rows: readonly Row[]): Span[] {
  const spans: Span[] = [];
  let open: number | null = null;
  rows.forEach((row, index) => {
    if (!row.fence) return;
    if (open === null) open = index;
    else {
      spans.push({ first: open, last: index });
      open = null;
    }
  });
  if (open !== null) spans.push({ first: open, last: rows.length - 1 });
  return spans;
}

const rowAt = (rows: readonly Row[], point: number): number => rows.filter((row) => row.start <= point).length - 1;

/**
 * The edit that puts `block` (whole lines) on lines of its own after the line of row `at`, or on that line when it is blank,
 * and puts the caret `caretInBlock` characters into the block.
 */
function putOnOwnLines(rows: readonly Row[], at: number, block: string, caretInBlock: number): TextEdit {
  const onBlankLine = rows[at].start === rows[at].end;
  const lead = onBlankLine ? '' : '\n';
  const point = onBlankLine ? rows[at].start : rows[at].end;
  const caret = point + lead.length + caretInBlock;
  return { from: point, to: point, insert: `${lead}${block}`, selectFrom: caret, selectTo: caret };
}

/** The edit that puts a starter table with these header words on lines of its own after the caret's line, with the caret in its first header cell. */
export function insertStarterTable(text: string, caret: number, headers: readonly string[]): TextEdit {
  const rows = rowsOf(text);
  const table = starterTable(headers);
  return putOnOwnLines(rows, rowAt(rows, Math.max(0, Math.min(caret, text.length))), table.text, table.caret);
}

/**
 * The edit that hides the lines a selection touches between two fence lines, which always stand alone on their lines.
 * The selection grows to whole lines and over every hidden part it touches, so text that was hidden stays hidden;
 * the fence lines inside are dropped and the whole range is wrapped once.
 * With nothing selected it opens an empty hidden block after the caret's line and puts the caret on its empty line.
 * `null` when there is nothing to do: the caret or the whole selection is already inside one hidden part.
 */
export function hideSelection(text: string, start: number, end: number): TextEdit | null {
  const first = Math.max(0, Math.min(start, end, text.length));
  const last = Math.max(0, Math.min(Math.max(start, end), text.length));
  const rows = rowsOf(text);
  const spans = hiddenSpans(rows);
  const reachedPoint = last > first && text[last - 1] === '\n' ? last - 1 : last;
  let top = rowAt(rows, first);
  let bottom = rowAt(rows, reachedPoint);
  if (spans.some((span) => span.first <= top && span.last >= bottom)) return null;
  if (last === first) return putOnOwnLines(rows, top, `${FENCE_LINE}\n${HIDDEN_FENCE}`, FENCE_LINE.length);
  const [touchedTop, touchedBottom] = [top, bottom];
  for (const span of spans) {
    if (span.first > touchedBottom || span.last < touchedTop) continue;
    top = Math.min(top, span.first);
    bottom = Math.max(bottom, span.last);
  }
  const kept = rows.slice(top, bottom + 1).filter((row) => !row.fence);
  if (kept.length === 0) return null;
  const lines = kept.map((row) => text.slice(row.start, row.end)).join('\n');
  const selectFrom = rows[top].start + FENCE_LINE.length;
  return { from: rows[top].start, to: rows[bottom].end, insert: `${FENCE_LINE}${lines}\n${HIDDEN_FENCE}`, selectFrom, selectTo: selectFrom + lines.length };
}
