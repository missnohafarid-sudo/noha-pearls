import { isHttpsUrl } from './media';

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

/** A line that is one https address and nothing else is a picture. */
const isPictureLine = (line: string): boolean => /^\S+$/.test(line.trim()) && isHttpsUrl(line);

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
 * a picture for each line that is only an https address, and a hidden block for the lines between two fence lines.
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

function linksOf(blocks: readonly TextBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === 'pictures') return block.links;
    return block.kind === 'hidden' ? linksOf(block.blocks) : [];
  });
}

/** Every picture link in a text, hidden blocks included. */
export function textPictureLinks(text: string): string[] {
  return linksOf(slideTextBlocks(text));
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

/**
 * The edit that hides the lines a selection touches between two fence lines, which always stand alone on their lines.
 * With nothing selected it opens an empty hidden block after the caret's line and puts the caret on its empty line.
 */
export function hideSelection(text: string, start: number, end: number): TextEdit {
  const first = Math.max(0, Math.min(start, end, text.length));
  const last = Math.max(0, Math.min(Math.max(start, end), text.length));
  const lineStart = first === 0 ? 0 : text.lastIndexOf('\n', first - 1) + 1;
  const reachedPoint = last > first && text[last - 1] === '\n' ? last - 1 : last;
  const found = text.indexOf('\n', reachedPoint);
  const lineEnd = found === -1 ? text.length : found;
  if (last > first) {
    const lines = text.slice(lineStart, lineEnd);
    const selectFrom = lineStart + FENCE_LINE.length;
    return { from: lineStart, to: lineEnd, insert: `${FENCE_LINE}${lines}\n${HIDDEN_FENCE}`, selectFrom, selectTo: selectFrom + lines.length };
  }
  const onBlankLine = lineStart === lineEnd;
  const lead = onBlankLine ? '' : '\n';
  const at = onBlankLine ? lineStart : lineEnd;
  const caret = at + lead.length + FENCE_LINE.length;
  return { from: at, to: at, insert: `${lead}${FENCE_LINE}\n${HIDDEN_FENCE}`, selectFrom: caret, selectTo: caret };
}
