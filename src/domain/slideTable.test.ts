import { describe, expect, it } from 'vitest';
import { isTableRow, starterTable, tableOf } from './slideTable';

describe('isTableRow', () => {
  it('needs a bar at both ends of the trimmed line and more than one character', () => {
    expect(isTableRow('|a|')).toBe(true);
    expect(isTableRow('  |a|b|  ')).toBe(true);
    expect(isTableRow('||')).toBe(true);
    for (const line of ['|', '', 'a|b', '|a', 'a|', '- |a|']) expect(isTableRow(line)).toBe(false);
  });
});

describe('tableOf', () => {
  it('needs at least two row lines, and one line alone makes nothing', () => {
    expect(tableOf(['| a | b |'])).toBeNull();
    expect(tableOf(['|x|'])).toBeNull();
    expect(tableOf([])).toBeNull();
    expect(tableOf(['| a | b |', '|1|2|'])).toEqual({ header: null, rows: [['a', 'b'], ['1', '2']] });
  });

  it('counts a row of dashes as one of the two rows: a header and its dash row are a table', () => {
    expect(tableOf(['|a|b|', '|---|---|'])).toEqual({ header: ['a', 'b'], rows: [] });
  });

  it('makes nothing of rows that draw nothing', () => {
    expect(tableOf(['|:--|--:|', '|---|---|'])).toBeNull();
  });

  it('turns the first row into the header only for a row of dashes right after it', () => {
    expect(tableOf(['|a|b|', '|:-:|---|', '|1|2|', '|---|---|'])).toEqual({ header: ['a', 'b'], rows: [['1', '2']] });
    expect(tableOf(['|a|b|', '|1|2|', '|---|---|', '|3|4|'])).toEqual({ header: null, rows: [['a', 'b'], ['1', '2'], ['3', '4']] });
  });

  it('pads every row, header included, to the widest', () => {
    expect(tableOf(['|a|', '|---|', '|1|2|3|', '|4|'])).toEqual({ header: ['a', '', ''], rows: [['1', '2', '3'], ['4', '', '']] });
  });
});

describe('starterTable', () => {
  it('is a header, a row of dashes and an empty row as wide as the headers, with the caret at the first header', () => {
    const { text, caret } = starterTable(['x', 'y']);
    expect(text).toBe('| x | y |\n| --- | --- |\n|  |  |');
    expect(text.slice(caret, caret + 1)).toBe('x');
  });
});
