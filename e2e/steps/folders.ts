import { expect, it } from 'vitest';
import type { Lesson, LessonFolder } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { DESKTOP, Device } from '../device';
import { SAMPLE } from '../sample';
import { storedRecords, type World } from '../world';

const tl = t.library;
const NAMES = { a: 'Folder A', b: 'Folder B', inner: 'Inner folder', renamed: 'Folder A renamed', empty: 'Empty folder', hidden: 'Hidden folder', deep: 'Deep folder', dragOuter: 'Drag outer', dragInner: 'Drag inner', keyOne: 'Key one', keyTwo: 'Key two', keyRenamed: 'Key renamed' } as const;
const NEW_FIELD = '.folder-tile--new input';

type Point = { x: number; y: number };

const folders = async (world: World) => (await storedRecords<LessonFolder>(world.admin, 'folders')).sort((a, b) => a.order - b.order);
const lessons = (world: World) => storedRecords<Lesson>(world.admin, 'lessons');

async function folderNamed(world: World, name: string): Promise<LessonFolder> {
  const found = (await folders(world)).find((folder) => folder.name === name);
  if (!found) throw new Error(`No stored folder is named "${name}".`);
  return found;
}

const open = (world: World, folderId: string | null) => world.admin.goto(folderId === null ? '#/' : `#/folder/${encodeURIComponent(folderId)}`);

const shownFolders = (device: Device) => device.texts('.folder-tile__name');
const crumbs = (device: Device) => device.texts('.path__button');

/** The centre of a folder tile's opening button, a crumb or a lesson card; null when it is not shown. */
function pointOf(device: Device, kind: 'tile' | 'crumb' | 'lesson', name: string): Promise<Point | null> {
  return device.page.evaluate(
    (wanted, label) => {
      const finders = {
        tile: () => [...document.querySelectorAll<HTMLElement>('.folder-tile')].find((tile) => tile.querySelector('.folder-tile__name')?.textContent === label)?.querySelector<HTMLElement>('.folder-tile__open'),
        crumb: () => [...document.querySelectorAll<HTMLElement>('.path__crumb')].find((crumb) => crumb.textContent === label),
        lesson: () => [...document.querySelectorAll<HTMLElement>('.lesson-tile')].find((tile) => tile.querySelector('.card__title')?.textContent === label)?.querySelector<HTMLElement>('.lesson-card'),
      };
      const element = finders[wanted as keyof typeof finders]();
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    },
    kind,
    name,
  );
}

async function mustPoint(device: Device, kind: 'tile' | 'crumb' | 'lesson', name: string): Promise<Point> {
  await device.page.evaluate(() => document.querySelector('.library')?.scrollIntoView({ block: 'start' }));
  await device.until(`the ${kind} "${name}" on screen`, async () => (await pointOf(device, kind, name)) !== null);
  return (await pointOf(device, kind, name))!;
}

interface Stop {
  at: Point;
  /** Looks at the screen while the pointer rests here, still holding the dragged item. */
  check?: () => Promise<void>;
}

/** A real pointer drag: press on `from`, glide through each stop, release on the last. */
async function drag(device: Device, from: Point, stops: Stop[]): Promise<void> {
  const { mouse } = device.page;
  await mouse.move(from.x, from.y);
  await mouse.down();
  await mouse.move(from.x + 12, from.y + 12, { steps: 4 });
  for (const stop of stops) {
    await mouse.move(stop.at.x, stop.at.y, { steps: 12 });
    await mouse.move(stop.at.x + 1, stop.at.y + 1, { steps: 2 });
    await stop.check?.();
  }
  await mouse.up();
}

/** Presses the button whose accessible name is `label`. */
async function pressNamed(device: Device, label: string): Promise<void> {
  const attempt = () =>
    device.page.evaluate((wanted) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.getAttribute('aria-label') === wanted && !candidate.disabled);
      button?.click();
      return button !== undefined;
    }, label);
  await device.until(`the button "${label}"`, attempt);
}

async function newFolderHere(world: World, name: string): Promise<void> {
  await world.admin.click(tl.newFolder);
  await world.admin.until('the name field', () => world.admin.exists(NEW_FIELD));
  await world.admin.page.keyboard.type(name);
  await world.admin.page.keyboard.press('Enter');
  await world.admin.until(`the folder "${name}" on screen`, async () => (await shownFolders(world.admin)).includes(name));
}

async function openTile(world: World, name: string): Promise<void> {
  await world.admin.until(`the tile "${name}" pressed`, () =>
    world.admin.page.evaluate((wanted) => {
      const tile = [...document.querySelectorAll<HTMLElement>('.folder-tile')].find((candidate) => candidate.querySelector('.folder-tile__name')?.textContent === wanted);
      const button = tile?.querySelector<HTMLButtonElement>('.folder-tile__open');
      button?.click();
      return button !== undefined && button !== null;
    }, name),
  );
  await world.admin.until(`the folder "${name}" open`, async () => (await crumbs(world.admin)).at(-1) === name);
}

const moveButton = (kind: 'folder' | 'lesson', name: string) => (kind === 'folder' ? tl.moveFolder(name) : tl.moveLesson(name));

/** Moves through the dialog: opens it for the item, checks nothing, and presses the destination. */
async function moveThroughDialog(world: World, kind: 'folder' | 'lesson', name: string, destination: string): Promise<void> {
  await pressNamed(world.admin, moveButton(kind, name));
  await world.admin.until('the move dialog', () => world.admin.exists('dialog[open] .move-list'));
  await world.admin.click(destination, 'dialog[open]');
  await world.admin.until('the move dialog closed', async () => !(await world.admin.exists('dialog[open]')));
}

async function confirmDelete(world: World, name: string): Promise<void> {
  await world.admin.until('the confirm button of that folder', () =>
    world.admin.page.evaluate(
      (folderName, confirm) => {
        const tile = [...document.querySelectorAll<HTMLElement>('.folder-tile')].find((candidate) => candidate.querySelector('.folder-tile__name')?.textContent === folderName);
        const button = [...(tile?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((candidate) => candidate.innerText.includes(confirm));
        button?.click();
        return button !== undefined;
      },
      name,
      t.common.confirm,
    ),
  );
  await world.admin.until('the folder gone', async () => !(await shownFolders(world.admin)).includes(name));
}

async function deleteFolder(world: World, name: string): Promise<void> {
  await pressNamed(world.admin, tl.deleteFolder(name));
  await confirmDelete(world, name);
}

const folderIdOf = (all: LessonFolder[], name: string) => all.find((folder) => folder.name === name)?.id;

/** The top level as it must look: no path line, the named folders and lessons on screen. */
async function expectTopLevel(device: Device, shown: { folders?: string[]; lessons?: string[] }): Promise<void> {
  await device.until('the top level with its folders and lessons and no path line', async () => {
    if (await device.exists('.path')) return false;
    const names = await shownFolders(device);
    if (!(shown.folders ?? []).every((name) => names.includes(name))) return false;
    for (const title of shown.lessons ?? []) if ((await pointOf(device, 'lesson', title)) === null) return false;
    return true;
  });
}

const activeLabel = (device: Device) => device.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);

const focusIsOnARealElement = (device: Device) => device.page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body && document.activeElement !== document.documentElement);

async function focusNamed(device: Device, label: string): Promise<void> {
  await device.until(`the button "${label}" focused`, () =>
    device.page.evaluate((wanted) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.getAttribute('aria-label') === wanted);
      button?.focus();
      return document.activeElement === button && button !== undefined;
    }, label),
  );
}

/** Presses Tab until the focused element's text is `text`; the dialog's own buttons are reached this way. */
async function tabTo(device: Device, text: string): Promise<void> {
  for (let presses = 0; presses < 20; presses += 1) {
    if ((await device.page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText.trim() ?? '')) === text) return;
    await device.page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached "${text}".`);
}

/** Removes what this lane made, whatever an earlier step left behind: its folders (their contents go up, none is lost), then its extra lessons. */
async function cleanUp(world: World, startingFolders: LessonFolder[], startingLessons: Lesson[]): Promise<void> {
  await world.admin.page.mouse.up().catch(() => undefined);
  const keptFolders = new Set(startingFolders.map((folder) => folder.id));
  const madeFolders = async () => (await folders(world)).filter((folder) => !keptFolders.has(folder.id));
  for (let left = await madeFolders(); left.length > 0; left = await madeFolders()) {
    const leaf = left.find((folder) => !left.some((other) => other.parentId === folder.id)) ?? left[0];
    await open(world, left.some((folder) => folder.id === leaf.parentId) ? leaf.parentId : null);
    await world.admin.waitFor(leaf.name);
    await deleteFolder(world, leaf.name);
  }
  const keptLessons = new Set(startingLessons.map((lesson) => lesson.id));
  for (const lesson of (await lessons(world)).filter((candidate) => !keptLessons.has(candidate.id))) {
    await world.admin.goto(`#/lesson/${encodeURIComponent(lesson.id)}`);
    await world.admin.click(t.lesson.delete);
    await world.admin.click(t.common.confirm);
    await world.admin.until('the lesson gone', async () => !(await lessons(world)).some((candidate) => candidate.id === lesson.id));
  }
}

/** Nested lesson folders: making, opening, moving by drag and by dialog, renaming, deleting, who sees what, and the Back button. */
export function foldersSteps(world: World): void {
  let startingLessons: Lesson[] = [];
  let startingFolders: LessonFolder[] = [];
  let newLessonId = '';

  it('the admin makes folders by typing their names in place', async () => {
    startingLessons = await lessons(world);
    startingFolders = await folders(world);
    await open(world, null);
    await world.admin.waitFor(SAMPLE.title);
    await expectTopLevel(world.admin, { lessons: [SAMPLE.title] });
    await world.admin.click(tl.newFolder);
    await world.admin.until('the name field focused', () => world.admin.page.evaluate((selector) => document.activeElement === document.querySelector(selector), NEW_FIELD));
    await world.admin.page.keyboard.type('Nothing');
    await world.admin.page.keyboard.press('Escape');
    await world.admin.until('the new-folder tile back', async () => !(await world.admin.exists(NEW_FIELD)) && (await world.admin.has(tl.newFolder)));
    expect(await folders(world)).toEqual(startingFolders);

    await newFolderHere(world, NAMES.a);
    await world.admin.click(tl.newFolder);
    await world.admin.until('the name field', () => world.admin.exists(NEW_FIELD));
    await world.admin.page.keyboard.type(NAMES.b);
    await world.admin.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await world.admin.until('the second folder on screen', async () => (await shownFolders(world.admin)).includes(NAMES.b));

    const stored = await folders(world);
    expect(stored.map((folder) => [folder.name, folder.parentId])).toEqual([[NAMES.a, null], [NAMES.b, null]]);
    expect(await world.admin.exists(NEW_FIELD)).toBe(false);
  });

  it('a folder is made inside another and the path line leads back up', async () => {
    await openTile(world, NAMES.a);
    const a = await folderNamed(world, NAMES.a);
    expect(world.admin.page.url().endsWith(`#/folder/${a.id}`)).toBe(true);
    await newFolderHere(world, NAMES.inner);
    expect((await folderNamed(world, NAMES.inner)).parentId).toBe(a.id);
    await openTile(world, NAMES.inner);
    expect(await crumbs(world.admin)).toEqual([tl.rootName, NAMES.a, NAMES.inner]);
    expect(await world.admin.page.$eval('.path__button[aria-current=page]', (button) => button.textContent)).toBe(NAMES.inner);
    await world.admin.click(NAMES.a, '.path');
    await world.admin.until('the outer folder open', async () => (await crumbs(world.admin)).join('|') === [tl.rootName, NAMES.a].join('|'));
    expect(await shownFolders(world.admin)).toContain(NAMES.inner);
  });

  it('a new lesson lands in the open folder', async () => {
    const a = await folderNamed(world, NAMES.a);
    await world.admin.waitFor(tl.keptIn([tl.rootName, NAMES.a].join(tl.pathSeparator)));
    await world.admin.click(t.home.panel.newLesson);
    await world.admin.until('the lesson editor', async () => world.admin.page.url().includes('#/lesson/'));
    const made = (await lessons(world)).find((lesson) => lesson.folderId === a.id);
    expect(made?.title).toBe(t.home.panel.newLessonTitle);
    newLessonId = made!.id;
    await open(world, a.id);
    await world.admin.waitFor(t.home.panel.newLessonTitle);
    expect(await world.admin.has(tl.emptyFolder)).toBe(false);
  });

  it('dragging a lesson onto a folder moves it there', async () => {
    const inner = await folderNamed(world, NAMES.inner);
    const a = await folderNamed(world, NAMES.a);
    const from = await mustPoint(world.admin, 'lesson', t.home.panel.newLessonTitle);
    const ownCrumb = await mustPoint(world.admin, 'crumb', NAMES.a);
    const tile = await mustPoint(world.admin, 'tile', NAMES.inner);
    await drag(world.admin, from, [
      { at: ownCrumb, check: async () => expect(await world.admin.exists('.is-drop')).toBe(false) },
      { at: tile, check: () => world.admin.until('the folder highlighted as a place to drop', () => world.admin.exists('.folder-tile.is-drop')) },
    ]);
    await world.admin.until('the lesson stored in the inner folder', async () => (await lessons(world)).find((lesson) => lesson.id === newLessonId)?.folderId === inner.id);
    await world.admin.until('the lesson gone from the outer folder', async () => (await pointOf(world.admin, 'lesson', t.home.panel.newLessonTitle)) === null);
    expect(world.admin.page.url().endsWith(`#/folder/${a.id}`)).toBe(true);
  });

  it('the move dialog puts a folder inside another and refuses the folder inside itself', async () => {
    await open(world, null);
    await world.admin.waitFor(NAMES.b);
    await pressNamed(world.admin, tl.moveFolder(NAMES.a));
    await world.admin.until('the move dialog', () => world.admin.exists('dialog[open] .move-list'));
    const buttons = () => world.admin.page.$$eval('dialog[open] .move-list__button', (all) => all.map((button) => [button.textContent, (button as HTMLButtonElement).disabled]));
    expect(await buttons()).toEqual([[tl.rootName, true], [NAMES.a, true], [NAMES.inner, true], [NAMES.b, false]]);
    expect(await world.admin.has(tl.move.title(NAMES.a))).toBe(true);
    await world.admin.click(t.common.close, 'dialog[open]');
    await world.admin.until('the move dialog closed', async () => !(await world.admin.exists('dialog[open]')));
    expect((await folderNamed(world, NAMES.a)).parentId).toBeNull();

    await moveThroughDialog(world, 'folder', NAMES.b, NAMES.a);
    expect((await folderNamed(world, NAMES.b)).parentId).toBe((await folderNamed(world, NAMES.a)).id);
    await world.admin.until('the moved folder gone from the top level', async () => !(await shownFolders(world.admin)).includes(NAMES.b));
  });

  it('dragging a folder onto the first crumb of the path line brings it back to the top', async () => {
    const a = await folderNamed(world, NAMES.a);
    await open(world, a.id);
    await world.admin.waitFor(NAMES.b);
    const from = await mustPoint(world.admin, 'tile', NAMES.b);
    const root = await mustPoint(world.admin, 'crumb', tl.rootName);
    await drag(world.admin, from, [{ at: root, check: () => world.admin.until('the first crumb highlighted', () => world.admin.exists('.path__crumb.is-drop')) }]);
    await world.admin.until('the folder stored at the top level', async () => (await folderNamed(world, NAMES.b)).parentId === null);
    await world.admin.until('the folder gone from the open folder', async () => !(await shownFolders(world.admin)).includes(NAMES.b));
  });

  it('renaming a folder in place keeps what is inside it', async () => {
    await open(world, null);
    await world.admin.waitFor(NAMES.a);
    await pressNamed(world.admin, tl.renameFolder(NAMES.a));
    await world.admin.until('the name field', () => world.admin.exists('.folder-tile input'));
    await world.admin.page.keyboard.type('Discarded');
    await world.admin.page.keyboard.press('Escape');
    await world.admin.until('the old name back', async () => (await shownFolders(world.admin)).includes(NAMES.a));
    await pressNamed(world.admin, tl.renameFolder(NAMES.a));
    await world.admin.until('the name field holding the old name', async () => (await world.admin.page.$eval('.folder-tile input', (field) => (field as HTMLInputElement).value)) === NAMES.a);
    await world.admin.page.keyboard.type(NAMES.renamed);
    await world.admin.page.keyboard.press('Enter');
    await world.admin.until('the new name on screen', async () => (await shownFolders(world.admin)).includes(NAMES.renamed));
    const stored = await folders(world);
    const renamed = stored.find((folder) => folder.name === NAMES.renamed);
    expect(renamed?.parentId).toBeNull();
    expect(stored.find((folder) => folder.name === NAMES.inner)?.parentId).toBe(renamed?.id);
    expect((await lessons(world)).find((lesson) => lesson.id === newLessonId)?.folderId).toBe(folderIdOf(stored, NAMES.inner));
  });

  it('deleting a folder moves its folders and lessons up and loses none', async () => {
    const before = await lessons(world);
    await pressNamed(world.admin, tl.deleteFolder(NAMES.renamed));
    await world.admin.waitFor(tl.deleteConfirm(1, 0, null));
    await confirmDelete(world, NAMES.renamed);
    expect(await shownFolders(world.admin)).toContain(NAMES.inner);
    expect((await folderNamed(world, NAMES.inner)).parentId).toBeNull();
    await deleteFolder(world, NAMES.inner);
    await world.admin.until('the lesson at the top level', async () => (await lessons(world)).find((lesson) => lesson.id === newLessonId)?.folderId === null);
    expect(await lessons(world)).toHaveLength(before.length);
    expect((await folders(world)).map((folder) => folder.name)).toEqual([NAMES.b]);
    await world.admin.waitFor(t.home.panel.newLessonTitle);
  });

  it('a signed-out visitor sees only folders that hold a lesson she may read', async () => {
    await newFolderHere(world, NAMES.empty);
    await newFolderHere(world, NAMES.hidden);
    await moveThroughDialog(world, 'lesson', t.home.panel.newLessonTitle, NAMES.hidden);
    await moveThroughDialog(world, 'lesson', SAMPLE.title, NAMES.b);
    const sample = (await lessons(world)).find((lesson) => lesson.title === SAMPLE.title);
    expect(sample?.folderId).toBe((await folderNamed(world, NAMES.b)).id);

    const visitor = await Device.open(world.browser, 'folder visitor', world.baseUrl, DESKTOP, world.errors);
    try {
      await visitor.waitFor(NAMES.b);
      expect(await shownFolders(visitor)).toEqual([NAMES.b]);
      expect(await visitor.has(SAMPLE.title)).toBe(false);
      expect(await visitor.count('.folder-tile__actions, .folder-tile--new, [draggable=true]')).toBe(0);
      await visitor.click(NAMES.b, '.folder-tile');
      await visitor.waitFor(SAMPLE.title);
      expect(await crumbs(visitor)).toEqual([tl.rootName, NAMES.b]);
    } finally {
      await visitor.page.close();
    }
  });

  it('a signed-out visitor who opens a folder holding only an unpublished lesson sees the top level and never its name', async () => {
    const hidden = await folderNamed(world, NAMES.hidden);
    const visitor = await Device.open(world.browser, 'hidden-folder visitor', world.baseUrl, DESKTOP, world.errors);
    try {
      await visitor.goto(`#/folder/${encodeURIComponent(hidden.id)}`);
      await visitor.waitFor(NAMES.b);
      await expectTopLevel(visitor, { folders: [NAMES.b] });
      expect(await visitor.has(NAMES.hidden)).toBe(false);
      expect(visitor.page.url().includes(hidden.id)).toBe(false);
    } finally {
      await visitor.page.close();
    }
  });

  it('a folder dragged onto itself is refused and nothing stored changes', async () => {
    await open(world, null);
    await world.admin.waitFor(NAMES.b);
    await newFolderHere(world, NAMES.dragOuter);
    const outer = await folderNamed(world, NAMES.dragOuter);
    await openTile(world, NAMES.dragOuter);
    await newFolderHere(world, NAMES.dragInner);
    await open(world, null);
    await world.admin.waitFor(NAMES.dragOuter);
    const before = await folders(world);
    const from = await mustPoint(world.admin, 'tile', NAMES.dragOuter);
    await drag(world.admin, from, [
      { at: { x: from.x + 4, y: from.y + 4 }, check: async () => expect(await world.admin.exists('.is-drop')).toBe(false) },
    ]);
    await world.admin.holds('the folders unchanged', async () => JSON.stringify(await folders(world)) === JSON.stringify(before));
    expect(await shownFolders(world.admin)).toContain(NAMES.dragOuter);
    await openTile(world, NAMES.dragOuter);
    expect(await shownFolders(world.admin)).toContain(NAMES.dragInner);
    expect((await folderNamed(world, NAMES.dragInner)).parentId).toBe(outer.id);
  });

  it('everything on the library can be done with the keyboard alone, and focus always lands on a real element', async () => {
    const { page } = world.admin;
    await open(world, null);
    await world.admin.waitFor(NAMES.b);
    await newFolderHere(world, NAMES.keyOne);
    await newFolderHere(world, NAMES.keyTwo);

    await focusNamed(world.admin, tl.renameFolder(NAMES.keyOne));
    await page.keyboard.press('Enter');
    await world.admin.until('the name field focused', () => page.evaluate(() => document.activeElement?.tagName === 'INPUT'));
    await page.keyboard.type(NAMES.keyRenamed);
    await page.keyboard.press('Enter');
    await world.admin.until('the new name on screen', async () => (await shownFolders(world.admin)).includes(NAMES.keyRenamed));
    await world.admin.until('focus back on the rename action', async () => (await activeLabel(world.admin)) === tl.renameFolder(NAMES.keyRenamed));

    await page.keyboard.press('Tab');
    expect(await activeLabel(world.admin)).toBe(tl.moveFolder(NAMES.keyRenamed));
    await page.keyboard.press('Enter');
    await world.admin.until('the move dialog', () => world.admin.exists('dialog[open] .move-list'));
    await tabTo(world.admin, NAMES.keyTwo);
    await page.keyboard.press('Enter');
    await world.admin.until('the move dialog closed', async () => !(await world.admin.exists('dialog[open]')));
    await world.admin.until('the folder stored inside the other', async () => (await folderNamed(world, NAMES.keyRenamed)).parentId === (await folderNamed(world, NAMES.keyTwo)).id);
    await world.admin.until('focus on a real element of the library', async () => (await focusIsOnARealElement(world.admin)) && (await page.evaluate(() => document.activeElement?.closest('.library') !== null)));

    await focusNamed(world.admin, tl.moveFolder(NAMES.keyTwo));
    await page.keyboard.press('Enter');
    await world.admin.until('the move dialog', () => world.admin.exists('dialog[open] .move-list'));
    await page.keyboard.press('Escape');
    await world.admin.until('the move dialog closed', async () => !(await world.admin.exists('dialog[open]')));
    await world.admin.until('focus back on the button that opened the dialog', async () => (await activeLabel(world.admin)) === tl.moveFolder(NAMES.keyTwo));
  });

  it('starting a class finds a lesson through its folders', async () => {
    await world.admin.goto('#/session');
    await world.admin.waitFor(t.session.startTitle);
    await world.admin.click(NAMES.b, '.folder-tile');
    await world.admin.waitFor(SAMPLE.title);
    expect(await world.admin.count('.folder-tile__actions, .folder-tile--new, [draggable=true]')).toBe(0);
    await world.admin.click(t.session.pickLesson, '.library__lessons');
    await world.admin.until('the lesson chosen', () => world.admin.exists('.library__lessons button[aria-pressed=true]'));
    await world.admin.waitFor(t.session.start);
    expect(await shownFolders(world.admin)).not.toContain(NAMES.empty);
    await world.admin.click(tl.rootName, '.path');
    await expectTopLevel(world.admin, { folders: [NAMES.b] });
    expect(await shownFolders(world.admin)).not.toContain(NAMES.empty);
  });

  it('the Back button of the browser walks up one folder', async () => {
    const b = await folderNamed(world, NAMES.b);
    await open(world, null);
    await world.admin.waitFor(NAMES.b);
    await openTile(world, NAMES.b);
    await newFolderHere(world, NAMES.deep);
    await openTile(world, NAMES.deep);
    await world.admin.page.goBack();
    await world.admin.until('the outer folder', async () => (await crumbs(world.admin)).join('|') === [tl.rootName, NAMES.b].join('|'));
    expect(world.admin.page.url().endsWith(`#/folder/${b.id}`)).toBe(true);
    await world.admin.page.goBack();
    await expectTopLevel(world.admin, { folders: [NAMES.b] });
    await world.admin.page.reload({ waitUntil: 'networkidle0' });
    await world.admin.waitFor(NAMES.b);
  });

  it('a folder id that does not exist shows the top level', async () => {
    await world.admin.goto('#/folder/no-such-folder');
    await expectTopLevel(world.admin, { folders: [NAMES.b] });
    expect(world.admin.page.url().includes('no-such-folder')).toBe(false);
  });

  it('the library is left as it was found, even when an earlier step failed', async () => {
    await cleanUp(world, startingFolders, startingLessons);
    await open(world, null);
    await world.admin.waitFor(SAMPLE.title);
    await expectTopLevel(world.admin, { lessons: [SAMPLE.title] });
    expect((await folders(world)).map((folder) => folder.id).sort()).toEqual(startingFolders.map((folder) => folder.id).sort());
    const now = await lessons(world);
    expect(now.map((lesson) => [lesson.id, lesson.folderId ?? null]).sort()).toEqual(startingLessons.map((lesson) => [lesson.id, lesson.folderId ?? null]).sort());
  });
}
