import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { Device, DESKTOP, type Viewport } from '../device';
import type { World } from '../world';

const TABLET: Viewport = { width: 600, height: 800 };
const PHONE_SIZE: Viewport = { width: 390, height: 800 };
const LONG_PAGE = 3000;
/** Taller than the home page ever is in the walkthrough, so the page is shorter than the screen. */
const TALL_SCREEN = 4000;
const BAR = '.shell__bar';
const MENU_BUTTON = `${BAR} .shell__menu-button`;
const MENU_LIST = `${BAR} .shell__menu-list`;
const MENU_LINK = `${MENU_LIST} a`;

/** Where the bar sits right now, and whether it is the topmost thing at its own centre. */
function barFacts(device: Device): Promise<{ top: number; bottom: number; topmost: boolean }> {
  return device.page.$eval(BAR, (bar) => {
    const box = bar.getBoundingClientRect();
    const at = document.elementFromPoint(window.innerWidth / 2, box.top + box.height / 2);
    return { top: box.top, bottom: box.bottom, topmost: at !== null && bar.contains(at) };
  });
}

const NOTE_TRACK = '.data-note__lane .data-note__track';

/** How the note at the foot of the home page is drawn in its lane: moving or not, how many copies show, and whether it keeps to one line. */
const noteFacts = (device: Device) =>
  device.page.$eval(NOTE_TRACK, (track) => {
    const note = track.parentElement as HTMLElement;
    const copies = [...track.children].filter((copy) => getComputedStyle(copy).display !== 'none');
    return {
      animation: getComputedStyle(track).animationName,
      copies: copies.length,
      align: getComputedStyle(note).textAlign,
      oneLine: copies.every((copy) => getComputedStyle(copy).whiteSpace === 'nowrap'),
      fits: note.scrollWidth <= note.clientWidth,
    };
  });

/** How far the note's bottom edge is from the bottom of the page, and from the bottom of the screen, in whole pixels. */
const noteGap = (device: Device) =>
  device.page.$eval('.data-note', (note) => {
    const bottom = note.getBoundingClientRect().bottom;
    return { fromPage: Math.round(document.documentElement.scrollHeight - (bottom + window.scrollY)), fromScreen: Math.round(window.innerHeight - bottom) };
  });

/** How far the running note has moved to the right right now, in pixels. */
const noteShift = (device: Device) => device.page.$eval(NOTE_TRACK, (track) => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41);

const menuTabs = (device: Device) => device.page.$$eval(MENU_LINK, (links) => links.map((link) => (link as HTMLElement).innerText.trim()));

/** The top bar stays on screen while the page scrolls, and the teacher's tabs become a menu where they no longer fit in a row. */
export function shellSteps(world: World): void {
  const sevenTabs = (['home', 'board', 'session', 'monitor', 'roster', 'cards', 'standings'] as const).map((name) => t.shell.nav[name]);
  let narrow: Device;
  const viewportBefore = { ...DESKTOP };

  it('on a wide screen the bar is still on screen, above the page, after the page is scrolled a long way', async () => {
    await world.admin.page.setViewport(viewportBefore);
    await world.admin.goto('#/');
    await world.admin.page.evaluate((height) => {
      const spacer = document.createElement('div');
      spacer.id = 'walkthrough-spacer';
      spacer.style.blockSize = `${height}px`;
      document.querySelector('.shell__main')?.append(spacer);
      window.scrollTo(0, document.documentElement.scrollHeight);
    }, LONG_PAGE);
    await world.admin.until('the page scrolled', () => world.admin.page.evaluate(() => window.scrollY > 500));
    const bar = await barFacts(world.admin);
    expect(bar.top).toBe(0);
    expect(bar.topmost).toBe(true);
    await world.admin.page.evaluate(() => {
      document.getElementById('walkthrough-spacer')?.remove();
      window.scrollTo(0, 0);
    });
  });

  it('at 600 pixels wide the teacher sees the menu button with the name of the page she is on, and not the row of tabs', async () => {
    await world.admin.page.setViewport(TABLET);
    narrow = world.admin;
    await narrow.until('the menu button', () => narrow.exists(MENU_BUTTON));
    expect(await narrow.page.$eval(MENU_BUTTON, (button) => (button as HTMLElement).innerText)).toContain(t.shell.menu);
    expect(await narrow.page.$eval(MENU_BUTTON, (button) => (button as HTMLElement).innerText)).toContain(t.shell.nav.home);
    expect(await narrow.page.$eval('.shell__nav', (nav) => getComputedStyle(nav).display)).toBe('none');
    expect(await narrow.page.$eval(MENU_BUTTON, (button) => button.getAttribute('aria-expanded'))).toBe('false');
    expect(await narrow.page.$eval(BAR, (bar) => bar.scrollWidth <= bar.clientWidth)).toBe(true);
  });

  it('the menu opens a vertical list on the right side holding all seven tabs, with focus inside it', async () => {
    await narrow.page.click(MENU_BUTTON);
    await narrow.until('the list open', () => narrow.page.$eval(MENU_LIST, (list) => !list.hasAttribute('hidden')));
    expect(await menuTabs(narrow)).toEqual(sevenTabs);
    expect(await narrow.page.$eval(MENU_BUTTON, (button) => button.getAttribute('aria-expanded'))).toBe('true');
    const places = await narrow.page.$$eval(MENU_LINK, (links) => links.map((link) => {
      const box = link.getBoundingClientRect();
      return { left: box.left, top: box.top };
    }));
    expect(new Set(places.map((box) => Math.round(box.left))).size).toBe(1);
    for (const [index, box] of places.entries()) if (index > 0) expect(box.top).toBeGreaterThan(places[index - 1].top);
    const list = await narrow.page.$eval(MENU_LIST, (element) => element.getBoundingClientRect().right);
    expect(list).toBeGreaterThan(TABLET.width / 2);
    await narrow.until('focus inside the list', () => narrow.page.evaluate((selector) => document.querySelector(selector)?.contains(document.activeElement) ?? false, MENU_LIST));
    expect(await narrow.page.$eval(`${MENU_LIST} [aria-current]`, (link) => (link as HTMLElement).innerText.trim())).toBe(t.shell.nav.home);
  });

  it('a tab chosen from the list opens that page and closes the list', async () => {
    await narrow.click(t.shell.nav.board, MENU_LIST);
    await narrow.until('the board page', async () => narrow.page.url().includes('#/board'));
    await narrow.until('the list closed', () => narrow.page.$eval(MENU_LIST, (list) => list.hasAttribute('hidden')));
    expect(await narrow.page.$eval(MENU_BUTTON, (button) => (button as HTMLElement).innerText)).toContain(t.shell.nav.board);
  });

  it('Escape closes the list and puts focus back on the menu button', async () => {
    await narrow.page.click(MENU_BUTTON);
    await narrow.until('the list open', () => narrow.page.$eval(MENU_LIST, (list) => !list.hasAttribute('hidden')));
    await narrow.page.keyboard.press('Escape');
    await narrow.until('the list closed', () => narrow.page.$eval(MENU_LIST, (list) => list.hasAttribute('hidden')));
    expect(await narrow.page.evaluate((selector) => document.activeElement === document.querySelector(selector), MENU_BUTTON)).toBe(true);
  });

  it('a press outside the list closes it', async () => {
    await narrow.page.click(MENU_BUTTON);
    await narrow.until('the list open', () => narrow.page.$eval(MENU_LIST, (list) => !list.hasAttribute('hidden')));
    await narrow.page.mouse.click(5, TABLET.height - 5);
    await narrow.until('the list closed', () => narrow.page.$eval(MENU_LIST, (list) => list.hasAttribute('hidden')));
  });

  it('the sign-out button is still on screen at 600 pixels wide', async () => {
    const box = await narrow.page.$$eval(`${BAR} button`, (buttons, label) => {
      const target = buttons.find((button) => (button as HTMLElement).innerText.includes(label));
      const found = target?.getBoundingClientRect();
      return found ? { left: found.left, right: found.right } : null;
    }, t.shell.signOut);
    if (!box) throw new Error('The sign-out button is not in the bar.');
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(TABLET.width);
  });

  it('a visitor at 390 pixels wide sees both tabs and no menu', async () => {
    const visitor = await Device.open(world.browser, 'narrow visitor', world.baseUrl, PHONE_SIZE, world.errors);
    await visitor.waitFor(t.shell.nav.home);
    expect(await visitor.exists('.shell__menu-button')).toBe(false);
    expect(await visitor.page.$eval('.shell__nav', (nav) => getComputedStyle(nav).display)).not.toBe('none');
    const shown = await visitor.page.$$eval('.shell__nav a', (links) => links.map((link) => (link as HTMLElement).innerText.trim()));
    expect(shown).toEqual([t.shell.nav.home, t.shell.nav.board]);
    await visitor.page.close();
  });

  it('the home page ends with the note on the students’ data: on a wide screen one still, centred line', async () => {
    const visitor = await Device.open(world.browser, 'wide visitor', world.baseUrl, DESKTOP, world.errors);
    await visitor.waitFor(t.home.dataNote);
    expect(await noteFacts(visitor)).toMatchObject({ animation: 'none', copies: 1, align: 'center', fits: true });
    expect(await visitor.exists('.data-note__dot'), 'this build has no hub to say where it runs').toBe(false);
    expect((await noteGap(visitor)).fromPage, 'the note is not on the bottom edge of the page').toBe(0);
    await visitor.page.close();
  });

  it('on a screen taller than the home page the note sits on the bottom edge of the screen, not part way up', async () => {
    const visitor = await Device.open(world.browser, 'tall visitor', world.baseUrl, { width: DESKTOP.width, height: TALL_SCREEN }, world.errors);
    await visitor.waitFor(t.home.dataNote);
    expect(await noteGap(visitor)).toEqual({ fromPage: 0, fromScreen: 0 });
    await visitor.page.close();
  });

  it('on a phone the note runs in one line toward the right, like a news ticker, and holds still in one wrapped line for a reader who asked for less motion', async () => {
    const visitor = await Device.open(world.browser, 'phone visitor', world.baseUrl, PHONE_SIZE, world.errors);
    await visitor.waitFor(t.home.dataNote);
    expect(await noteFacts(visitor)).toMatchObject({ animation: 'data-note-run', copies: 2, oneLine: true });
    const first = await noteShift(visitor);
    await visitor.until('the note moved to the right', async () => (await noteShift(visitor)) > first);

    await visitor.page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    expect(await noteFacts(visitor)).toMatchObject({ animation: 'none', copies: 1, oneLine: false, fits: true });
    await visitor.page.close();
  });

  it('the seven tabs stay in one row, with nothing clipped, at 1240 and 1280 pixels wide', async () => {
    for (const width of [1240, 1280]) {
      await world.admin.page.setViewport({ width, height: DESKTOP.height });
      const fit = await world.admin.page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('.shell__nav');
        const bar = document.querySelector<HTMLElement>('.shell__bar');
        const tops = [...(nav?.querySelectorAll('a') ?? [])].map((link) => Math.round(link.getBoundingClientRect().top));
        return {
          shown: nav !== null && getComputedStyle(nav).display !== 'none',
          navFits: nav !== null && nav.scrollWidth <= nav.clientWidth,
          barFits: bar !== null && bar.scrollWidth <= bar.clientWidth,
          oneRow: new Set(tops).size === 1 && tops.length === 7,
        };
      });
      expect(fit).toEqual({ shown: true, navFits: true, barFits: true, oneRow: true });
    }
  });

  it('the viewport is put back as the walkthrough uses it', async () => {
    await world.admin.page.setViewport(viewportBefore);
    expect(await world.admin.page.$eval('.shell__nav', (nav) => getComputedStyle(nav).display)).not.toBe('none');
  });
}
