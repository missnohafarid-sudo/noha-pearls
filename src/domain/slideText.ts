/** One piece of a slide's plain text, in reading order. */
export type TextBlock = { kind: 'line'; text: string; bullet: boolean };

const BULLET_MARK = '- ';

function lineBlock(line: string): TextBlock {
  const text = line.trimStart();
  return text.startsWith(BULLET_MARK) ? { kind: 'line', text: text.slice(BULLET_MARK.length), bullet: true } : { kind: 'line', text: line, bullet: false };
}

/** What the plain text of a slide is made of: one line per non-blank line, and a line starting with "- " is a bullet. */
export function slideTextBlocks(text: string): TextBlock[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(lineBlock);
}
