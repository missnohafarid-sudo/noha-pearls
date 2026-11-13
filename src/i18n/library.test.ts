import { describe, expect, it } from 'vitest';
import { library } from './library';

describe('library words', () => {
  it('a folder holding nothing says it is empty, otherwise the lessons are counted', () => {
    expect([0, 1, 2, 3, 10, 11, 100].map(library.holds)).toEqual(['فارغ', 'درس واحد', 'درسان', '3 دروس', '10 دروس', '11 درسًا', '100 درس']);
  });

  it('the keep sentence names only what is there and does not mention an empty inside', () => {
    const { keeps } = library.deleteDialog;
    expect(keeps(0, 0, null)).toBe('سيُحذف المجلد.');
    expect(keeps(1, 0, null)).toContain('(مجلد واحد) سينتقل إلى «الدروس»');
    expect(keeps(0, 2, 'س')).toContain('(درسان) سينتقل إلى المجلد');
    expect(keeps(2, 3, null)).toContain('(مجلدان و3 دروس) سينتقل');
  });

  it('the lose sentence counts everything that goes with the folder', () => {
    expect(library.deleteDialog.loses(2, 3)).toContain('(مجلدان و3 دروس)');
    expect(library.deleteDialog.loses(0, 1)).toContain('(درس واحد)');
  });

  it('names a selection of lessons in the form that follows «نقل»', () => {
    expect(library.select.name(2)).toBe('درسين');
  });

  it('names a folder for a screen reader as a folder with its name and what it holds', () => {
    expect(library.folderLabel('س', library.holds(2))).toContain('مجلد');
    expect(library.folderLabel('س', library.holds(2))).toContain('درسان');
  });
});
