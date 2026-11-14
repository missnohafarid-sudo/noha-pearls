import { fingerprint } from './fingerprint';
import { isPictureLink } from './media';
import { isTableRow, MIN_TABLE_ROWS, tableOf, type SlideTable } from './slideTable';

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

export const isFence = (line: string): boolean => FENCE.test(line.trim());

/** A line that is one picture address (see `isPictureLink`) and nothing else is a picture. */
const isPictureLine = (line: string): boolean => /^\S+$/.test(line.trim()) && isPictureLink(line);

function lineBlock(line: string): TextBlock {
  const text = line.trimStart();
  return text.startsWith(BULLET_MARK) ? { kind: 'line', text: text.slice(BULLET_MARK.length), bullet: true } : { kind: 'line', text: line, bullet: false };
}

function addLine(blocks: TextBlock[], line: string): void {
  const last = blocks[blocks.length - 1];
  if (!isPictureLine(line)) blocks.push(lineBlock(line));
  else if (last?.kind === 'pictures') last.links.push(line.trim());
  else blocks.push({ kind: 'pictures', links: [line.trim()] });
}

const isBlank = (line: string): boolean => line.trim() === '';

/** The blocks of some lines; blank lines are skipped. Row lines in a row make a table when there are enough of them (see `tableOf`), else they are ordinary lines. */
function blocksOf(lines: readonly string[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  let rows: string[] = [];
  const endRows = () => {
    const table = tableOf(rows);
    if (table) blocks.push({ kind: 'table', ...table });
    else if (rows.length < MIN_TABLE_ROWS) for (const row of rows) addLine(blocks, row);
    rows = [];
  };
  for (const line of lines) {
    if (isBlank(line)) continue;
    if (!isPictureLine(line) && isTableRow(line)) rows.push(line);
    else {
      endRows();
      addLine(blocks, line);
    }
  }
  endRows();
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
