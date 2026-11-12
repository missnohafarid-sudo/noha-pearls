import { describe, expect, it } from 'vitest';
import { createFolder, FolderTree, movedFolder } from './folders';
import type { LessonFolder } from './models';

const folder = (id: string, parentId: string | null, order = 1): LessonFolder => ({ id, name: id, parentId, order });
const inFolder = (id: string, folderId: string | null) => ({ id, folderId });

const folders = [folder('a', null), folder('b', 'a'), folder('c', 'b'), folder('d', null, 2)];
const tree = new FolderTree(folders);

describe('lesson folder tree', () => {
  it('nests three deep and gives the path from the top', () => {
    expect(tree.parentOf('c')).toBe('b');
    expect(tree.path('c').map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(tree.path(null)).toEqual([]);
    expect(tree.path('nope')).toEqual([]);
  });

  it('lists children in their order', () => {
    const children = [folder('x', null, 3), folder('y', null, 1), folder('z', null, 2), folder('w', 'y')];
    expect(new FolderTree(children).children(null).map((f) => f.id)).toEqual(['y', 'z', 'x']);
    expect(new FolderTree(children).children('y').map((f) => f.id)).toEqual(['w']);
  });

  it('creates a folder last among all folders', () => {
    const made = createFolder('جديد', 'a', folders);
    expect(made).toMatchObject({ name: 'جديد', parentId: 'a', order: 3 });
  });

  it('refuses to move a folder into itself, its child or a deep descendant', () => {
    expect(tree.canMove('a', 'a')).toBe(false);
    expect(tree.canMove('a', 'b')).toBe(false);
    expect(tree.canMove('a', 'c')).toBe(false);
    expect(tree.moveProblem('a', 'c')).toBe('folder-inside-itself');
  });

  it('refuses unknown folders and targets, and allows the top level and staying put', () => {
    expect(tree.moveProblem('nope', null)).toBe('folder-missing');
    expect(tree.moveProblem('a', 'nope')).toBe('folder-missing');
    expect(tree.canMove('c', null)).toBe(true);
    expect(tree.canMove('c', 'b')).toBe(true);
    expect(tree.canMove('c', 'd')).toBe(true);
  });

  it('moves a folder last under its new parent, and returns the same object when nothing changes', () => {
    const c = folders[2];
    expect(movedFolder(folders, c, 'd')).toMatchObject({ id: 'c', parentId: 'd', order: 3 });
    expect(movedFolder(folders, c, 'b')).toBe(c);
  });

  it('shows a folder with a dangling parent at the top level', () => {
    const dangling = new FolderTree([folder('a', 'gone')]);
    expect(dangling.parentOf('a')).toBeNull();
    expect(dangling.children(null).map((f) => f.id)).toEqual(['a']);
  });

  it('survives stored loops: both folders show at the top level', () => {
    const loop = new FolderTree([folder('a', 'b'), folder('b', 'a'), folder('s', 's'), folder('child', 'a')]);
    expect(loop.parentOf('a')).toBeNull();
    expect(loop.parentOf('b')).toBeNull();
    expect(loop.parentOf('s')).toBeNull();
    expect(loop.children(null).map((f) => f.id).sort()).toEqual(['a', 'b', 's']);
    expect(loop.path('child').map((f) => f.id)).toEqual(['a', 'child']);
    expect(loop.within('a')).toEqual(new Set(['child']));
    expect(loop.within('s')).toEqual(new Set());
  });

  it('finds every descendant but not the folder itself', () => {
    expect(tree.within('a')).toEqual(new Set(['b', 'c']));
    expect(tree.within('c')).toEqual(new Set());
  });

  it('puts a lesson with a missing or unknown folder at the top level', () => {
    const oldLesson = { id: 'old' } as unknown as { id: string; folderId: string | null };
    expect(tree.folderOf(oldLesson)).toBeNull();
    expect(tree.folderOf(inFolder('l', 'gone'))).toBeNull();
    expect(tree.folderOf(inFolder('l', 'b'))).toBe('b');
    const lessons = [oldLesson, inFolder('x', 'gone'), inFolder('y', 'b')];
    expect(tree.lessonsIn(lessons, null).map((l) => l.id)).toEqual(['old', 'x']);
    expect(tree.lessonsIn(lessons, 'b').map((l) => l.id)).toEqual(['y']);
  });

  it('counts lessons inside a folder at any depth', () => {
    const lessons = [inFolder('1', 'a'), inFolder('2', 'c'), inFolder('3', 'd'), inFolder('4', null)];
    expect(tree.lessonCountWithin(lessons, 'a')).toBe(2);
    expect(tree.lessonCountWithin(lessons, 'b')).toBe(1);
    expect(tree.hasLessonsWithin(lessons, 'a')).toBe(true);
    expect(tree.hasLessonsWithin([inFolder('1', 'd')], 'a')).toBe(false);
    expect(tree.hasLessonsWithin([inFolder('1', 'c')], 'a')).toBe(true);
  });

  it('copes with a chain 500 folders deep', () => {
    const chain = Array.from({ length: 500 }, (_, i) => folder(`f${i}`, i === 0 ? null : `f${i - 1}`));
    const deep = new FolderTree(chain);
    expect(deep.path('f499').map((f) => f.id)).toEqual(chain.map((f) => f.id));
    expect(deep.within('f0').size).toBe(499);
    expect(deep.canMove('f0', 'f499')).toBe(false);
    expect(deep.moveProblem('f0', 'f499')).toBe('folder-inside-itself');
  });

  it('copes with one parent holding 300 folders, each with a lesson', () => {
    const wide = [folder('p', null), ...Array.from({ length: 300 }, (_, i) => folder(`k${i}`, 'p', 300 - i))];
    const lessons = wide.slice(1).map((f) => inFolder(`l-${f.id}`, f.id));
    const index = new FolderTree(wide);
    expect(index.children('p').map((f) => f.id)).toEqual(wide.slice(1).reverse().map((f) => f.id));
    expect(index.lessonCountWithin(lessons, 'p')).toBe(300);
  });
});
