import { describe, expect, it } from 'vitest';
import { addTableRow, isTableRow, starterTable, startTable } from './slideTable';

describe('isTableRow', () => {
  it('needs a bar at both ends of the trimmed line and more than one character', () => {
    expect(isTableRow('|a|')).toBe(true);
    expect(isTableRow('  |a|b|  ')).toBe(true);
    expect(isTableRow('||')).toBe(true);
    for (const line of ['|', '', 'a|b', '|a', 'a|', '- |a|']) expect(isTableRow(line)).toBe(false);
  });
});

describe('startTable and addTableRow', () => {
  it('starts a table from a row, and from a row of dashes starts nothing', () => {
    expect(startTable('| a | b |')).toEqual({ header: null, rows: [['a', 'b']] });
    expect(startTable('|:--|--:|')).toBeNull();
  });

  it('turns the first row into the header only for a row of dashes right after it', () => {
    const table = startTable('|a|b|');
    if (!table) throw new Error('no table');
    addTableRow(table, '|:-:|---|');
    addTableRow(table, '|1|2|');
    addTableRow(table, '|---|---|');
    expect(table).toEqual({ header: ['a', 'b'], rows: [['1', '2']] });
  });

  it('pads every row, header included, to the widest', () => {
    const table = startTable('|a|');
    if (!table) throw new Error('no table');
    addTableRow(table, '|---|');
    addTableRow(table, '|1|2|3|');
    addTableRow(table, '|4|');
    expect(table).toEqual({ header: ['a', '', ''], rows: [['1', '2', '3'], ['4', '', '']] });
  });
});

describe('starterTable', () => {
  it('is a header, a row of dashes and an empty row as wide as the headers, with the caret at the first header', () => {
    const { text, caret } = starterTable(['x', 'y']);
    expect(text).toBe('| x | y |\n| --- | --- |\n|  |  |');
    expect(text.slice(caret, caret + 1)).toBe('x');
  });
});
