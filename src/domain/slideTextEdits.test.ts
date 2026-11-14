import { describe, expect, it } from 'vitest';
import { F, flatten, hidden, line, lines, table } from './slideText.fixtures';
import { slideTextBlocks } from './slideText';
import { hideSelection, insertStarterTable } from './slideTextEdits';

describe('hideSelection', () => {
  const apply = (text: string, start: number, end: number) => {
    const edit = hideSelection(text, start, end);
    if (!edit) throw new Error('no edit');
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

describe('hideSelection around text that is already hidden', () => {
  const hiddenRows = (text: string) => slideTextBlocks(text).flatMap((block) => (block.kind === 'hidden' ? flatten(block.blocks) : []));
  const run = (text: string, start: number, end: number) => {
    const edit = hideSelection(text, start, end);
    return edit && text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  };
  const keepsHidden = (text: string, start: number, end: number) => {
    const result = run(text, start, end);
    expect(result).not.toBeNull();
    for (const row of hiddenRows(text)) expect(hiddenRows(result ?? '')).toContain(row);
    return result;
  };

  it('selecting all over an inner hidden part leaves one part and nothing visible that was hidden', () => {
    const text = lines('x', F, 'y', F, 'z');
    const result = keepsHidden(text, 0, text.length);
    expect(result).toBe(lines(F, 'x', 'y', 'z', F));
    expect(slideTextBlocks(result ?? '')).toEqual([hidden(line('x'), line('y'), line('z'))]);
  });

  it('a selection starting inside a part and ending in visible text takes the whole part', () => {
    const text = lines('a', F, 'b', 'c', F, 'd');
    expect(keepsHidden(text, text.indexOf('c'), text.indexOf('d') + 1)).toBe(lines('a', F, 'b', 'c', 'd', F));
  });

  it('a selection starting in visible text and ending inside a part takes the whole part', () => {
    const text = lines('a', F, 'b', 'c', F, 'd');
    expect(keepsHidden(text, 0, text.indexOf('b') + 1)).toBe(lines(F, 'a', 'b', 'c', F, 'd'));
  });

  it('a selection spanning two parts makes one part', () => {
    const text = lines('a', F, 'b1', 'b2', F, 'c', F, 'd1', 'd2', F, 'e');
    expect(keepsHidden(text, text.indexOf('b2'), text.indexOf('d1') + 1)).toBe(lines('a', F, 'b1', 'b2', 'c', 'd1', 'd2', F, 'e'));
  });

  it('a caret, or a whole selection, inside one part does nothing', () => {
    const text = lines('a', F, 'b', 'c', F, 'd');
    const at = text.indexOf('b');
    expect(hideSelection(text, at, at)).toBeNull();
    expect(hideSelection(text, at, text.indexOf('c') + 1)).toBeNull();
    expect(hideSelection(text, text.indexOf(F), text.lastIndexOf(F) + 3)).toBeNull();
  });

  it('an unclosed part is widened to the end of the text and closed', () => {
    const text = lines('a', 'b', F, 'c', 'd');
    expect(keepsHidden(text, 0, text.indexOf('c') + 1)).toBe(lines(F, 'a', 'b', 'c', 'd', F));
    expect(hideSelection(text, text.indexOf('d'), text.indexOf('d'))).toBeNull();
  });

  it('works on text with CRLF line breaks', () => {
    const text = `x\r\n${F}\r\ny\r\n${F}\r\nz`;
    const result = keepsHidden(text, 0, text.length);
    expect(hiddenRows(result ?? '')).toEqual(['x', 'y', 'z']);
  });

  it('never makes a hidden line visible, whatever the selection', () => {
    const text = lines('a', F, 'b', 'c', F, 'd', F, 'e', 'f');
    for (let start = 0; start <= text.length; start += 1) {
      for (let end = start; end <= text.length; end += 1) {
        const result = run(text, start, end);
        if (result === null) continue;
        for (const row of ['b', 'c', 'e', 'f']) expect(hiddenRows(result)).toContain(row);
      }
    }
  });
});

describe('insertStarterTable', () => {
  const headers = ['one', 'two'];
  const apply = (text: string, caret: number) => {
    const edit = insertStarterTable(text, caret, headers);
    return { edit, result: text.slice(0, edit.from) + edit.insert + text.slice(edit.to) };
  };

  it('puts a header, a row of dashes and an empty row on lines after the caret line, with the caret in the first header cell', () => {
    const { edit, result } = apply('before\nafter', 2);
    expect(result).toBe('before\n| one | two |\n| --- | --- |\n|  |  |\nafter');
    expect(result.slice(edit.selectFrom, edit.selectFrom + 3)).toBe('one');
    expect(edit.selectTo).toBe(edit.selectFrom);
    expect(slideTextBlocks(result)).toEqual([line('before'), table(['one', 'two'], ['', '']), line('after')]);
  });

  it('uses a blank line the caret is on', () => {
    expect(apply('a\n\nb', 2).result).toBe('a\n| one | two |\n| --- | --- |\n|  |  |\nb');
  });

  it('works on an empty text and at the end of a line', () => {
    expect(apply('', 0).result).toBe('| one | two |\n| --- | --- |\n|  |  |');
    expect(apply('a', 1).result).toBe('a\n| one | two |\n| --- | --- |\n|  |  |');
  });

  it('puts the table inside a hidden part when the caret is in one', () => {
    const { result } = apply(lines(F, 'x', F), 5);
    expect(slideTextBlocks(result)).toEqual([hidden(line('x'), table(['one', 'two'], ['', '']))]);
  });
});
