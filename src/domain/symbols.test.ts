import { describe, expect, it } from 'vitest';
import { SYMBOL_GROUPS } from './symbols';
import { directedRuns } from './textDirection';

const SENTENCE_START = 'الناتج';
const SENTENCE_END = 'في المسألة';

describe('the symbols the editor offers', () => {
  it('has no symbol twice', () => {
    const all = SYMBOL_GROUPS.flatMap((group) => group.symbols);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(SYMBOL_GROUPS.flatMap((group) => group.symbols))('%s stays inside its equation in right-to-left text', (symbol) => {
    const equation = `x${symbol}y`;
    const runs = directedRuns(`${SENTENCE_START} ${equation} ${SENTENCE_END}`);
    expect(runs.map((run) => run.text).join('')).toBe(`${SENTENCE_START} ${equation} ${SENTENCE_END}`);
    expect(runs.filter((run) => run.ltr && run.text.includes(equation))).toHaveLength(1);
  });
});
