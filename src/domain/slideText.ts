import { isPictureLink } from './media';

/** One piece of a slide's plain text, in reading order. */
export type TextBlock =
  | { kind: 'line'; text: string; bullet: boolean }
  | { kind: 'pictures'; links: string[] }
  | { kind: 'hidden'; blocks: TextBlock[] };

/** A line of only these, three or more, opens a hidden block and the next such line closes it. */
export const HIDDEN_FENCE = '+++';

const BULLET_MARK = '- ';
const FENCE = new RegExp(`^\\+{${HIDDEN_FENCE.length},}$`);
const LINE_BREAK = /\r?\n/;

const isFence = (line: string): boolean => FENCE.test(line.trim());

/** A line that is one picture address (see `isPictureLink`) and nothing else is a picture. */
const isPictureLine = (line: string): boolean => /^\S+$/.test(line.trim()) && isPictureLink(line);

function lineBlock(line: string): TextBlock {
  const text = line.trimStart();
  return text.startsWith(BULLET_MARK) ? { kind: 'line', text: text.slice(BULLET_MARK.length), bullet: true } : { kind: 'line', text: line, bullet: false };
}

function add(blocks: TextBlock[], line: string): void {
  if (!isPictureLine(line)) {
    blocks.push(lineBlock(line));
    return;
  }
  const last = blocks[blocks.length - 1];
  if (last?.kind === 'pictures') last.links.push(line.trim());
  else blocks.push({ kind: 'pictures', links: [line.trim()] });
}

/**
 * What the plain text of a slide is made of: one line per non-blank line (a line starting with "- " is a bullet),
 * a picture for each line that is only a picture address, and a hidden block for the lines between two fence lines.
 * A fence that is never closed hides everything after it; a hidden block with nothing in it is dropped.
 */
export function slideTextBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let hidden: TextBlock[] | null = null;
  const close = () => {
    if (hidden && hidden.length > 0) blocks.push({ kind: 'hidden', blocks: hidden });
    hidden = null;
  };
  for (const line of text.split(LINE_BREAK)) {
    if (line.trim() === '') continue;
    if (!isFence(line)) add(hidden ?? blocks, line);
    else if (hidden) close();
    else hidden = [];
  }
  close();
  return blocks;
}

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
  if (last === first) {
    const onBlankLine = rows[top].start === rows[top].end;
    const lead = onBlankLine ? '' : '\n';
    const at = onBlankLine ? rows[top].start : rows[top].end;
    const caret = at + lead.length + FENCE_LINE.length;
    return { from: at, to: at, insert: `${lead}${FENCE_LINE}\n${HIDDEN_FENCE}`, selectFrom: caret, selectTo: caret };
  }
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
