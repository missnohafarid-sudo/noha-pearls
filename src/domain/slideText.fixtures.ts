import { expect } from 'vitest';
import { HIDDEN_FENCE, type TextBlock } from './slideText';

/** Small builders for the blocks and texts the slide-text tests compare. */

export const F = HIDDEN_FENCE;
export const PHOTO = 'https://example.org/a.png';
export const OTHER = 'https://example.org/b.png';

export const line = (text: string, bullet = false): TextBlock => ({ kind: 'line', text, bullet });
export const hidden = (...blocks: TextBlock[]): TextBlock => ({ kind: 'hidden', key: expect.stringMatching(/^[0-9a-f]{8}$/) as unknown as string, blocks });
export const pictures = (...links: string[]): TextBlock => ({ kind: 'pictures', links });
export const table = (header: string[] | null, ...rows: string[][]): TextBlock => ({ kind: 'table', header, rows });
export const lines = (...rows: string[]) => rows.join('\n');

/** Every line of the blocks as plain text, hidden blocks opened, in reading order. */
export function flatten(blocks: readonly TextBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === 'line') return [block.bullet ? `- ${block.text}`.trim() : block.text.trim()];
    if (block.kind === 'table') return [...(block.header ? [block.header] : []), ...block.rows].map((cells) => `|${cells.join('|')}|`);
    return block.kind === 'pictures' ? block.links : flatten(block.blocks);
  });
}
