import { describe, expect, it } from 'vitest';
import { HIDDEN_FENCE, hideSelection, slideTextBlocks, textPictureLinks, type TextBlock } from './slideText';

const line = (text: string, bullet = false): TextBlock => ({ kind: 'line', text, bullet });
const hidden = (...blocks: TextBlock[]): TextBlock => ({ kind: 'hidden', blocks });
const pictures = (...links: string[]): TextBlock => ({ kind: 'pictures', links });
const lines = (...rows: string[]) => rows.join('\n');
const F = HIDDEN_FENCE;
const PHOTO = 'https://example.org/a.png';
const OTHER = 'https://example.org/b.png';

describe('slideTextBlocks: plain lines', () => {
  it('is empty for an empty or blank text', () => {
    expect(slideTextBlocks('')).toEqual([]);
    expect(slideTextBlocks('  \n\n \t\n')).toEqual([]);
  });

  it('gives one line block per non-blank line, in order', () => {
    expect(slideTextBlocks('one\n\n  \ntwo')).toEqual([line('one'), line('two')]);
  });

  it('keeps an ordinary line as it is', () => {
    expect(slideTextBlocks('  indented ')).toEqual([line('  indented ')]);
  });

  it('turns a line starting with "- " into a bullet holding the rest', () => {
    expect(slideTextBlocks('- first\n   - second')).toEqual([line('first', true), line('second', true)]);
  });

  it('does not turn a dash without a space into a bullet', () => {
    expect(slideTextBlocks('-5 degrees')).toEqual([line('-5 degrees')]);
  });
});

describe('slideTextBlocks: hidden blocks', () => {
  it('has none without a fence', () => {
    expect(slideTextBlocks(lines('a', 'b')).some((block) => block.kind === 'hidden')).toBe(false);
  });

  it('holds the lines between two fences in one block, in the middle', () => {
    expect(slideTextBlocks(lines('a', F, 'secret', F, 'b'))).toEqual([line('a'), hidden(line('secret')), line('b')]);
  });

  it('allows a block first and a block last', () => {
    expect(slideTextBlocks(lines(F, 's', F, 'a'))).toEqual([hidden(line('s')), line('a')]);
    expect(slideTextBlocks(lines('a', F, 's', F))).toEqual([line('a'), hidden(line('s'))]);
  });

  it('allows two and three blocks', () => {
    expect(slideTextBlocks(lines('a', F, 's1', F, 'b', F, 's2', F, 'c'))).toEqual([line('a'), hidden(line('s1')), line('b'), hidden(line('s2')), line('c')]);
    expect(slideTextBlocks(lines(F, '1', F, 'x', F, '2', F, 'y', F, '3', F))).toEqual([hidden(line('1')), line('x'), hidden(line('2')), line('y'), hidden(line('3'))]);
  });

  it('allows blocks that follow each other', () => {
    expect(slideTextBlocks(lines(F, 'one', F, F, 'two', F))).toEqual([hidden(line('one')), hidden(line('two'))]);
  });

  it('hides everything to the end when the last fence is never closed', () => {
    expect(slideTextBlocks(lines('a', F, 'b', 'c'))).toEqual([line('a'), hidden(line('b'), line('c'))]);
  });

  it('closes a block at the next fence, never nesting', () => {
    expect(slideTextBlocks(lines(F, 'a', F, 'b', F, 'c'))).toEqual([hidden(line('a')), line('b'), hidden(line('c'))]);
  });

  it('drops an empty block and a block of only blank lines', () => {
    expect(slideTextBlocks(lines('a', F, F, 'b'))).toEqual([line('a'), line('b')]);
    expect(slideTextBlocks(lines('a', F, '', '   ', F, 'b'))).toEqual([line('a'), line('b')]);
    expect(slideTextBlocks(F)).toEqual([]);
    expect(slideTextBlocks(lines(F, ''))).toEqual([]);
  });

  it('accepts a fence with spaces around it and with four or more plus signs', () => {
    expect(slideTextBlocks(lines('a', `  ${F}  `, 's', '\t+++++', 'b'))).toEqual([line('a'), hidden(line('s')), line('b')]);
    expect(slideTextBlocks(lines('++++++', 's', '++++'))).toEqual([hidden(line('s'))]);
  });

  it('reads Windows line endings without leaving a carriage return on a fence or a line', () => {
    expect(slideTextBlocks(`a\r\n${F}\r\ns\r\n${F}\r\nb`)).toEqual([line('a'), hidden(line('s')), line('b')]);
  });

  it('treats a plus run inside a longer line, and two plus signs, as ordinary text', () => {
    expect(slideTextBlocks('a +++ b')).toEqual([line('a +++ b')]);
    expect(slideTextBlocks('+++ b')).toEqual([line('+++ b')]);
    expect(slideTextBlocks('++')).toEqual([line('++')]);
    expect(slideTextBlocks('1 ++ 1')).toEqual([line('1 ++ 1')]);
  });

  it('draws bullets inside a hidden block', () => {
    expect(slideTextBlocks(lines(F, '- one', 'two', F))).toEqual([hidden(line('one', true), line('two'))]);
  });
});

describe('slideTextBlocks: pictures', () => {
  it('turns a line that is only an https address into a picture', () => {
    expect(slideTextBlocks(PHOTO)).toEqual([pictures(PHOTO)]);
    expect(slideTextBlocks(`   ${PHOTO}  `)).toEqual([pictures(PHOTO)]);
  });

  it('joins consecutive picture lines into one block', () => {
    expect(slideTextBlocks(lines(PHOTO, OTHER))).toEqual([pictures(PHOTO, OTHER)]);
  });

  it('makes two blocks of picture lines separated by text', () => {
    expect(slideTextBlocks(lines(PHOTO, 'between', OTHER))).toEqual([pictures(PHOTO), line('between'), pictures(OTHER)]);
  });

  it('puts a picture between two visible lines where it stands', () => {
    expect(slideTextBlocks(lines('a', PHOTO, 'b'))).toEqual([line('a'), pictures(PHOTO), line('b')]);
  });

  it('draws a picture line inside a hidden block', () => {
    expect(slideTextBlocks(lines('a', F, '- s', PHOTO, F))).toEqual([line('a'), hidden(line('s', true), pictures(PHOTO))]);
  });

  it('does not join pictures across a hidden block', () => {
    expect(slideTextBlocks(lines(PHOTO, F, OTHER, F, PHOTO))).toEqual([pictures(PHOTO), hidden(pictures(OTHER)), pictures(PHOTO)]);
  });

  it('leaves an http address, and a link with words, as ordinary text', () => {
    expect(slideTextBlocks('http://example.org/a.png')).toEqual([line('http://example.org/a.png')]);
    expect(slideTextBlocks(`see ${PHOTO}`)).toEqual([line(`see ${PHOTO}`)]);
    expect(slideTextBlocks(`${PHOTO} here`)).toEqual([line(`${PHOTO} here`)]);
  });
});

describe('textPictureLinks', () => {
  it('finds links inside and outside hidden blocks, in order', () => {
    expect(textPictureLinks(lines(PHOTO, 'x', F, OTHER, F, 'y'))).toEqual([PHOTO, OTHER]);
  });

  it('is empty for a text without a picture line', () => {
    expect(textPictureLinks(lines('a', F, 'b', F))).toEqual([]);
    expect(textPictureLinks('')).toEqual([]);
  });

  it('gives a link without the spaces around it', () => {
    expect(textPictureLinks(`  ${PHOTO}  `)).toEqual([PHOTO]);
  });
});

function flatten(blocks: readonly TextBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === 'line') return [block.bullet ? `- ${block.text}`.trim() : block.text.trim()];
    return block.kind === 'pictures' ? block.links : flatten(block.blocks);
  });
}

describe('slideTextBlocks: nothing is lost or duplicated', () => {
  const texts = [
    lines('a', F, 'b', F, 'c'),
    lines(F, 'a', 'b'),
    lines('- a', PHOTO, F, '- b', OTHER, F, 'c', F, F, 'd', F, PHOTO),
    `x\r\n${F}\r\n\r\ny\r\n\r\n${F}\r\n${PHOTO}`,
    lines('', '  ', 'one', '++', '+++ no', 'http://example.org/x.png', F, '  two  ', ' +++++ ', 'three'),
    lines(F, F, F, 'a', F),
  ];

  it.each(texts.map((text, index) => [index, text] as const))('keeps every other line once and in order (text %i)', (_index, text) => {
    const expected = text
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter((row) => row !== '' && !/^\+{3,}$/.test(row));
    expect(flatten(slideTextBlocks(text))).toEqual(expected);
  });
});

describe('hideSelection', () => {
  const apply = (text: string, start: number, end: number) => {
    const edit = hideSelection(text, start, end);
    const result = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
    return { edit, result, selected: result.slice(edit.selectFrom, edit.selectTo) };
  };
  const hiddenLines = (text: string) => slideTextBlocks(text).flatMap((block) => (block.kind === 'hidden' ? [flatten(block.blocks)] : []));

  it('widens a selection in the middle of a line to the whole line', () => {
    const { result, selected } = apply('one\ntwo words\nthree', 6, 9);
    expect(result).toBe(`one\n${F}\ntwo words\n${F}\nthree`);
    expect(selected).toBe('two words');
    expect(slideTextBlocks(result)).toEqual([line('one'), hidden(line('two words')), line('three')]);
  });

  it('hides several lines at once', () => {
    const { result, selected } = apply('a\nb\nc\nd', 3, 5);
    expect(result).toBe(`a\n${F}\nb\nc\n${F}\nd`);
    expect(selected).toBe('b\nc');
    expect(hiddenLines(result)).toEqual([['b', 'c']]);
  });

  it('hides the first line', () => {
    const { result, selected } = apply('a\nb', 0, 1);
    expect(result).toBe(`${F}\na\n${F}\nb`);
    expect(selected).toBe('a');
    expect(hiddenLines(result)).toEqual([['a']]);
  });

  it('hides the last line when the text has no trailing newline', () => {
    const { result, selected } = apply('a\nb', 2, 3);
    expect(result).toBe(`a\n${F}\nb\n${F}`);
    expect(selected).toBe('b');
    expect(hiddenLines(result)).toEqual([['b']]);
  });

  it('hides the whole text', () => {
    const text = 'a\nb\nc';
    const { result } = apply(text, 0, text.length);
    expect(result).toBe(`${F}\na\nb\nc\n${F}`);
    expect(hiddenLines(result)).toEqual([['a', 'b', 'c']]);
  });

  it('does not take the next line when the selection ends right after a line break', () => {
    const { result, selected } = apply('a\nb\nc', 0, 2);
    expect(result).toBe(`${F}\na\n${F}\nb\nc`);
    expect(selected).toBe('a');
  });

  it('keeps the other text untouched, with the selection given backwards too', () => {
    const forward = apply('x\ny\nz', 2, 3);
    const backward = apply('x\ny\nz', 3, 2);
    expect(backward.result).toBe(forward.result);
  });

  it('opens an empty block in empty text and puts the caret between the fences', () => {
    const { edit, result } = apply('', 0, 0);
    expect(result).toBe(`${F}\n\n${F}`);
    expect(edit.selectFrom).toBe(edit.selectTo);
    expect(result.slice(0, edit.selectFrom)).toBe(`${F}\n`);
  });

  it('opens an empty block after the caret line when nothing is selected in the middle', () => {
    const { edit, result } = apply('one\ntwo\nthree', 5, 5);
    expect(result).toBe(`one\ntwo\n${F}\n\n${F}\nthree`);
    expect(result.slice(0, edit.selectFrom)).toBe(`one\ntwo\n${F}\n`);
    expect(result[edit.selectFrom]).toBe('\n');
  });

  it('opens an empty block at the end of the text', () => {
    const { edit, result } = apply('one\ntwo', 7, 7);
    expect(result).toBe(`one\ntwo\n${F}\n\n${F}`);
    expect(result.slice(0, edit.selectFrom)).toBe(`one\ntwo\n${F}\n`);
  });

  it('uses a blank caret line instead of adding another break', () => {
    const { result } = apply('a\n\nb', 2, 2);
    expect(result).toBe(`a\n${F}\n\n${F}\nb`);
    expect(apply('a\n', 2, 2).result).toBe(`a\n${F}\n\n${F}`);
  });

  it('never leaves a fence sharing its line with text', () => {
    for (const [text, start, end] of [['abc', 1, 2], ['abc\n', 0, 0], ['\nabc', 0, 0], ['a\nb\n', 2, 4], ['a\n\n\nb', 3, 3]] as const) {
      const { result } = apply(text, start, end);
      expect(result.split('\n').filter((row) => row.includes(F)).every((row) => row === F)).toBe(true);
    }
  });

  it('clamps a selection past the end of the text', () => {
    expect(apply('a', 5, 9).result).toBe(`a\n${F}\n\n${F}`);
  });
});
