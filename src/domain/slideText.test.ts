import { describe, expect, it } from 'vitest';
import { slideTextBlocks } from './slideText';

describe('slideTextBlocks', () => {
  it('is empty for an empty or blank text', () => {
    expect(slideTextBlocks('')).toEqual([]);
    expect(slideTextBlocks('  \n\n \t\n')).toEqual([]);
  });

  it('gives one line block per non-blank line, in order', () => {
    expect(slideTextBlocks('one\n\n  \ntwo')).toEqual([
      { kind: 'line', text: 'one', bullet: false },
      { kind: 'line', text: 'two', bullet: false },
    ]);
  });

  it('keeps an ordinary line as it is', () => {
    expect(slideTextBlocks('  indented ')).toEqual([{ kind: 'line', text: '  indented ', bullet: false }]);
  });

  it('turns a line starting with "- " into a bullet holding the rest', () => {
    expect(slideTextBlocks('- first\n   - second')).toEqual([
      { kind: 'line', text: 'first', bullet: true },
      { kind: 'line', text: 'second', bullet: true },
    ]);
  });

  it('does not turn a dash without a space into a bullet', () => {
    expect(slideTextBlocks('-5 degrees')).toEqual([{ kind: 'line', text: '-5 degrees', bullet: false }]);
  });
});
