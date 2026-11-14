import { expect, it } from 'vitest';
import { PEARL_SHADES } from '../../src/domain/pearlShades';
import { t } from '../../src/i18n';
import { Device, DESKTOP } from '../device';
import type { World } from '../world';

const PICKER = '.shell__bar .theme-picker';
const PICKER_BUTTON = `${PICKER} .theme-picker__button`;
const PICKER_LIST = `${PICKER} .theme-picker__list`;
const DARK_BELOW = 60;
const LIGHT_ABOVE = 160;

const lookOf = (device: Device) => device.page.evaluate(() => document.documentElement.dataset.theme);
const accentOf = (device: Device) => device.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

/** How light a computed colour reads, 0 (black) to 255 (white). */
const brightness = (rgb: string): number => {
  const [red, green, blue] = (rgb.match(/\d+/g) ?? []).map(Number);
  return (red * 299 + green * 587 + blue * 114) / 1000;
};

const pageColours = (device: Device) =>
  device.page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color }));

/** The teacher's pearl button in the bar chooses the look of the whole site, for every device. */
export function siteThemeSteps(world: World): void {
  const admin = () => world.admin;
  let visitor: Device;
  let defaultAccent: string;

  async function choose(shade: keyof typeof t.common.pearlShade): Promise<void> {
    await admin().page.click(PICKER_BUTTON);
    await admin().until('the list of looks open', () => admin().page.$eval(PICKER_LIST, (list) => !list.hasAttribute('hidden')));
    await admin().click(t.common.pearlShade[shade], PICKER_LIST);
    await admin().until('the list closed', () => admin().page.$eval(PICKER_LIST, (list) => list.hasAttribute('hidden')));
  }

  it('a signed-out visitor sees no pearl button in the bar', async () => {
    visitor = await Device.open(world.browser, 'look visitor', world.baseUrl, DESKTOP, world.errors);
    await visitor.waitFor(t.shell.nav.home);
    expect(await visitor.exists('.theme-picker')).toBe(false);
  });

  it('the signed-in teacher sees it at the far end of the bar, named, with the list closed', async () => {
    await admin().page.bringToFront();
    await admin().goto('#/');
    await admin().until('the pearl button', () => admin().exists(PICKER_BUTTON));
    expect(await admin().page.$eval(PICKER_BUTTON, (button) => button.getAttribute('aria-label'))).toBe(t.shell.theme.button);
    expect(await admin().page.$eval(PICKER_BUTTON, (button) => button.getAttribute('aria-expanded'))).toBe('false');
    const edges = await admin().page.$$eval('.shell__admin > *', (items) => items.map((item) => item.getBoundingClientRect().left));
    expect(Math.min(...edges)).toBe(edges[edges.length - 1]);
    defaultAccent = await accentOf(admin());
    expect(await lookOf(admin())).toBe('white');
  });

  it('opening it lists the seven looks by name, the current one marked', async () => {
    await admin().page.click(PICKER_BUTTON);
    await admin().until('the list open', () => admin().page.$eval(PICKER_LIST, (list) => !list.hasAttribute('hidden')));
    const names = await admin().page.$$eval(`${PICKER_LIST} button`, (buttons) => buttons.map((button) => (button as HTMLElement).innerText.trim()));
    expect(names).toEqual(PEARL_SHADES.map((shade) => t.common.pearlShade[shade]));
    expect(await admin().page.$eval(`${PICKER_LIST} [aria-current]`, (button) => (button as HTMLElement).innerText.trim())).toBe(t.common.pearlShade.white);
    const box = await admin().page.$eval(PICKER_LIST, (list) => {
      const { left, right } = list.getBoundingClientRect();
      return { left, right };
    });
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(DESKTOP.width);
  });

  it('Escape closes the list and puts focus back on the button', async () => {
    await admin().page.keyboard.press('Escape');
    await admin().until('the list closed', () => admin().page.$eval(PICKER_LIST, (list) => list.hasAttribute('hidden')));
    expect(await admin().page.evaluate((selector) => document.activeElement === document.querySelector(selector), PICKER_BUTTON)).toBe(true);
  });

  it('choosing purple changes the look and the accent colour', async () => {
    await choose('purple');
    await admin().until('the purple look', async () => (await lookOf(admin())) === 'purple');
    expect(await accentOf(admin())).not.toBe(defaultAccent);
  });

  it('a signed-out device shows the same look within a moment', async () => {
    await visitor.until('the purple look on the visitor', async () => (await lookOf(visitor)) === 'purple');
    expect(await accentOf(visitor)).toBe(await accentOf(admin()));
  });

  it('choosing black gives a dark page with light text, on both devices', async () => {
    await choose('black');
    for (const device of [admin(), visitor]) {
      await device.until('the black look', async () => (await lookOf(device)) === 'black');
      const colours = await pageColours(device);
      expect(brightness(colours.background)).toBeLessThan(DARK_BELOW);
      expect(brightness(colours.text)).toBeGreaterThan(LIGHT_ABOVE);
    }
  });

  it('choosing the pearl white puts the usual look back', async () => {
    await choose('white');
    await admin().until('the usual look', async () => (await lookOf(admin())) === 'white');
    await visitor.until('the usual look on the visitor', async () => (await lookOf(visitor)) === 'white');
    expect(await accentOf(admin())).toBe(defaultAccent);
    await visitor.page.close();
  });
}
