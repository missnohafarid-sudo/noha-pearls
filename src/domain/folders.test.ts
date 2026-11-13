import { describe, expect, it } from 'vitest';
import { createFolder, FolderTree, movedFolder } from './folders';
import type { Lesson, LessonFolder } from './models';

const folder = (id: string, parentId: string | null, order = 1): LessonFolder => ({ id, name: id, parentId, order });
const inFolder = (id: string, folderId: string | null) => ({ id, folderId });
const lessonIn = (id: string, folderId: string | null, published = true) => ({ id, folderId, published }) as Lesson;

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
    expect(tree.moveProblem('a', 'a')).not.toBeNull();
    expect(tree.moveProblem('a', 'b')).not.toBeNull();
    expect(tree.moveProblem('a', 'c')).not.toBeNull();
    expect(tree.moveProblem('a', 'c')).toBe('folder-inside-itself');
  });

  it('refuses unknown folders and targets, and allows the top level and staying put', () => {
    expect(tree.moveProblem('nope', null)).toBe('folder-missing');
    expect(tree.moveProblem('a', 'nope')).toBe('folder-missing');
    expect(tree.moveProblem('c', null)).toBeNull();
    expect(tree.moveProblem('c', 'b')).toBeNull();
    expect(tree.moveProblem('c', 'd')).toBeNull();
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
    const groups = tree.lessonsByFolder([oldLesson, inFolder('x', 'gone'), inFolder('y', 'b')]);
    expect(groups.get(null)?.map((l) => l.id)).toEqual(['old', 'x']);
    expect(groups.get('b')?.map((l) => l.id)).toEqual(['y']);
  });

  it('counts lessons inside each folder at any depth in one pass', () => {
    const counts = tree.lessonCounts([inFolder('1', 'a'), inFolder('2', 'c'), inFolder('3', 'd'), inFolder('4', null), inFolder('5', 'gone')]);
    expect(Object.fromEntries(counts)).toEqual({ a: 2, b: 1, c: 1, d: 1 });
    expect(tree.holdingIds([inFolder('1', 'c')])).toEqual(new Set(['a', 'b', 'c']));
    expect(tree.holdingIds([])).toEqual(new Set());
  });

  it('copes with a chain 500 folders deep', () => {
    const chain = Array.from({ length: 500 }, (_, i) => folder(`f${i}`, i === 0 ? null : `f${i - 1}`));
    const deep = new FolderTree(chain);
    expect(deep.path('f499').map((f) => f.id)).toEqual(chain.map((f) => f.id));
    expect(deep.within('f0').size).toBe(499);
    expect(deep.moveProblem('f0', 'f499')).not.toBeNull();
    expect(deep.moveProblem('f0', 'f499')).toBe('folder-inside-itself');
  });

  it('copes with one parent holding 300 folders, each with a lesson', () => {
    const wide = [folder('p', null), ...Array.from({ length: 300 }, (_, i) => folder(`k${i}`, 'p', 300 - i))];
    const lessons = wide.slice(1).map((f) => inFolder(`l-${f.id}`, f.id));
    const index = new FolderTree(wide);
    expect(index.children('p').map((f) => f.id)).toEqual(wide.slice(1).reverse().map((f) => f.id));
    expect(index.lessonCounts(lessons).get('p')).toBe(300);
  });

  it('counts lessons of a nested tree and of a 500-deep chain without trouble', () => {
    const chain = Array.from({ length: 500 }, (_, i) => folder(`f${i}`, i === 0 ? null : `f${i - 1}`));
    const counts = new FolderTree(chain).lessonCounts([inFolder('l1', 'f499'), inFolder('l2', 'f250')]);
    expect(counts.get('f0')).toBe(2);
    expect(counts.get('f250')).toBe(2);
    expect(counts.get('f251')).toBe(1);
  });
});

describe('folders a reader sees', () => {
  it('lists the ids of every folder it was built from', () => {
    expect(tree.ids()).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('the admin sees every folder, empty ones too', () => {
    expect(tree.visibleIds([], true)).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(tree.shownChildren(null, tree.visibleIds([], true)).map((f) => f.id)).toEqual(['a', 'd']);
  });

  it('a visitor sees only folders holding a lesson she may view at any depth, and their ancestors', () => {
    const visible = tree.visibleIds([lessonIn('l1', 'c'), lessonIn('l2', 'd', false)], false);
    expect(visible).toEqual(new Set(['a', 'b', 'c']));
    expect(tree.shownChildren(null, visible).map((f) => f.id)).toEqual(['a']);
    expect(tree.shownChildren('a', visible).map((f) => f.id)).toEqual(['b']);
    expect(tree.shownChildren(null, tree.visibleIds([], false))).toEqual([]);
  });

  it('a requested folder that is hidden, unknown or absent shows the top level', () => {
    const visible = tree.visibleIds([lessonIn('l1', 'b')], false);
    expect(tree.shownFolderOf('b', visible)).toBe('b');
    expect(tree.shownFolderOf('d', visible)).toBeNull();
    expect(tree.shownFolderOf('c', visible)).toBeNull();
    expect(tree.shownFolderOf('nope', visible)).toBeNull();
    expect(tree.shownFolderOf(null, visible)).toBeNull();
    expect(tree.shownFolderOf(undefined, visible)).toBeNull();
  });
});

describe('where an item may be put', () => {
  it('a lesson may go to the top level or any existing folder except where it is', () => {
    const lesson = { kind: 'lesson', id: 'l', from: 'b' } as const;
    expect(tree.placeProblem(lesson, null)).toBeNull();
    expect(tree.placeProblem(lesson, 'd')).toBeNull();
    expect(tree.placeProblem(lesson, 'b')).toBe('here');
    expect(tree.placeProblem(lesson, 'nope')).toBe('folder-missing');
    expect(tree.placeProblem({ kind: 'lesson', id: 'l', from: null }, null)).toBe('here');
  });

  it('a folder goes where moveProblem allows and not onto its current parent', () => {
    expect(tree.placeProblem({ kind: 'folder', id: 'c' }, null)).toBeNull();
    expect(tree.placeProblem({ kind: 'folder', id: 'c' }, 'd')).toBeNull();
    expect(tree.placeProblem({ kind: 'folder', id: 'c' }, 'b')).toBe('here');
    expect(tree.placeProblem({ kind: 'folder', id: 'a' }, null)).toBe('here');
    expect(tree.placeProblem({ kind: 'folder', id: 'a' }, 'a')).toBe('folder-inside-itself');
    expect(tree.placeProblem({ kind: 'folder', id: 'a' }, 'c')).toBe('folder-inside-itself');
    expect(tree.placeProblem({ kind: 'folder', id: 'a' }, 'nope')).toBe('folder-missing');
    expect(tree.placeProblem({ kind: 'folder', id: 'nope' }, null)).toBe('folder-missing');
  });
});

describe('repairing a stored tree', () => {
  it('has nothing to repair when the tree is healthy', () => {
    expect(tree.repairs()).toEqual([]);
  });

  it('gives the shown parent to folders whose stored parent is dangling or in a loop', () => {
    const broken = new FolderTree([folder('a', 'b'), folder('b', 'a'), folder('c', 'gone'), folder('child', 'a')]);
    expect(broken.repairs().map((f) => [f.id, f.parentId]).sort()).toEqual([['a', null], ['b', null], ['c', null]]);
  });
});
