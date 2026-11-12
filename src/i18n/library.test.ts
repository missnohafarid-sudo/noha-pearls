import { describe, expect, it } from 'vitest';
import { library } from './library';

describe('library words', () => {
  it('a folder holding nothing says it is empty, otherwise the lessons are counted', () => {
    expect([0, 1, 2, 3, 10, 11, 100].map(library.holds)).toEqual(['فارغ', 'درس واحد', 'درسان', '3 دروس', '10 دروس', '11 درسًا', '100 درس']);
  });

  it('the delete sentence names only what is there and does not mention an empty inside', () => {
    expect(library.deleteConfirm(0, 0, null)).toBe('سيُحذف المجلد. اضغطي «تأكيد» للحذف.');
    expect(library.deleteConfirm(1, 0, null)).toContain('(مجلد واحد) سينتقل إلى «الدروس»')
    expect(library.deleteConfirm(1, 0, null)).toContain(`«${library.rootName}»`);;
    expect(library.deleteConfirm(0, 2, 'س')).toContain('(درسان) سينتقل إلى المجلد');
    expect(library.deleteConfirm(2, 3, null)).toContain('(مجلدان و3 دروس) سينتقل');
  });

  it('names a folder for a screen reader as a folder with its name and what it holds', () => {
    expect(library.folderLabel('س', library.holds(2))).toContain('مجلد');
    expect(library.folderLabel('س', library.holds(2))).toContain('درسان');
  });
});
