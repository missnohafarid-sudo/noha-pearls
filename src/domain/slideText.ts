import { fingerprint } from './fingerprint';
import { isPictureLink } from './media';
import { addTableRow, isTableRow, starterTable, startTable, type SlideTable } from './slideTable';

/** One piece of a slide's plain text, in reading order. */
export type TextBlock =
  | { kind: 'line'; text: string; bullet: boolean }
  | { kind: 'pictures'; links: string[] }
  | ({ kind: 'table' } & SlideTable)
  | { kind: 'hidden'; key: string; blocks: TextBlock[] };

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

function addLine(blocks: TextBlock[], line: string): void {
  const last = blocks[blocks.length - 1];
  if (isPictureLine(line)) {
    if (last?.kind === 'pictures') last.links.push(line.trim());
    else blocks.push({ kind: 'pictures', links: [line.trim()] });
  } else if (!isTableRow(line)) {
    blocks.push(lineBlock(line));
  } else if (last?.kind === 'table') {
    addTableRow(last, line);
  } else {
    const table = startTable(line);
    if (table) blocks.push({ kind: 'table', ...table });
  }
}

const isBlank = (line: string): boolean => line.trim() === '';

/** The blocks of some lines; blank lines are skipped. */
function blocksOf(lines: readonly string[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const line of lines) if (!isBlank(line)) addLine(blocks, line);
  return blocks;
}

/** The name of a hidden part: a fingerprint of its own lines, trimmed, so the same words keep the same name wherever the part moves to. */
export function partKey(text: string): string {
  return fingerprint(
    text
      .split(LINE_BREAK)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n'),
  );
}

interface ScannedLine {
  line: string;
  fence: boolean;
  /** Which fenced stretch the line belongs to (fences included), counted from 0; null outside any. A fence never closed runs to the end. */
  stretch: number | null;
}

function scan(text: string): ScannedLine[] {
  let stretch: number | null = null;
  let count = 0;
  return text.split(LINE_BREAK).map((line) => {
    if (!isFence(line)) return { line, fence: false, stretch };
    const own = stretch ?? count++;
    stretch = stretch === null ? own : null;
    return { line, fence: true, stretch: own };
  });
}

interface Part {
  key: string;
  blocks: TextBlock[];
}

/** The fenced stretches that draw something, by stretch number: these are a slide text's hidden parts. A stretch that draws nothing is no part. */
function partsOf(lines: readonly ScannedLine[]): Map<number, Part> {
  const inside = new Map<number, string[]>();
  for (const { line, fence, stretch } of lines) {
    if (stretch === null || fence) continue;
    inside.set(stretch, [...(inside.get(stretch) ?? []), line]);
  }
  const parts = new Map<number, Part>();
  for (const [stretch, rows] of inside) {
    const blocks = blocksOf(rows);
    if (blocks.length > 0) parts.set(stretch, { key: partKey(rows.join('\n')), blocks });
  }
  return parts;
}

/**
 * What the plain text of a slide is made of: one line per non-blank line (a line starting with "- " is a bullet),
 * a picture for each line that is only a picture address, a table for consecutive row lines between upright bars, and a hidden block for the lines between two fence lines.
 * A fence that is never closed hides everything after it; a hidden block that draws nothing is dropped.
 */
export function slideTextBlocks(text: string): TextBlock[] {
  const scanned = scan(text);
  const parts = partsOf(scanned);
  const blocks: TextBlock[] = [];
  const placed = new Set<number>();
  let run: string[] = [];
  const flush = () => {
    blocks.push(...blocksOf(run));
    run = [];
  };
  for (const { line, fence, stretch } of scanned) {
    if (fence) continue;
    if (stretch === null) run.push(line);
    else if (parts.has(stretch) && !placed.has(stretch)) {
      placed.add(stretch);
      flush();
      blocks.push({ kind: 'hidden', ...(parts.get(stretch) as Part) });
    }
  }
  flush();
  return blocks;
}

/** The keys of the hidden parts a text holds, in reading order. */
export function hiddenPartKeys(text: string): string[] {
  return [...partsOf(scan(text)).values()].map(({ key }) => key);
}

/** The text with every hidden part whose key is not in `opened` cut out, fences and all; the opened ones stay as they are. A fenced stretch that draws nothing is cut too. */
export function keepOpenedParts(text: string, opened: readonly string[]): string {
  const lines = scan(text);
  const kept = new Set([...partsOf(lines)].filter(([, { key }]) => opened.includes(key)).map(([stretch]) => stretch));
  return lines
    .filter(({ stretch }) => stretch === null || kept.has(stretch))
    .map(({ line }) => line)
    .join('\n');
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
