import type { Device } from '../device';

/** How a shared device's names are moved onto the options of an individual choice question, for the steps that drive them. */

const MOVES = 12;

export const NAME_ROW = '.member-row .name-chip';
const optionSlot = (index: number) => `[data-option="${index}"]`;

interface Point {
  x: number;
  y: number;
}

async function centreOf(device: Device, selector: string, text: string | null): Promise<Point> {
  const found = await device.page.evaluate(
    (css, wanted) => {
      const element = [...document.querySelectorAll<HTMLElement>(css)].find((candidate) => wanted === null || candidate.innerText.includes(wanted));
      const box = element?.getBoundingClientRect();
      return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    },
    selector,
    text,
  );
  if (!found) throw new Error(`nothing matched ${selector}${text ? ` with "${text}"` : ''}`);
  return found;
}

/** Brings the option to the middle of the screen; the row of names is sticky, so it stays in view. */
async function showOption(device: Device, index: number): Promise<void> {
  await device.page.evaluate((css) => document.querySelector(css)?.scrollIntoView({ block: 'center' }), optionSlot(index));
}

export type Pointer = 'mouse' | 'touch';

async function route(device: Device, name: string, option: number, from: string): Promise<(step: number) => Point> {
  await showOption(device, option);
  const start = await centreOf(device, from, name);
  const end = await centreOf(device, `${optionSlot(option)} .slide-option`, null);
  return (step) => ({ x: start.x + ((end.x - start.x) * step) / MOVES, y: start.y + ((end.y - start.y) * step) / MOVES });
}

/** Presses the mouse on a name and carries it over an option without letting go. */
export async function holdName(device: Device, name: string, option: number, from = NAME_ROW): Promise<void> {
  const at = await route(device, name, option, from);
  await device.page.mouse.move(at(0).x, at(0).y);
  await device.page.mouse.down();
  for (let step = 1; step <= MOVES; step += 1) await device.page.mouse.move(at(step).x, at(step).y);
}

/** Moves a name from the row (or from under an option) onto an option with a mouse or a finger, in small steps. */
export async function dragName(device: Device, name: string, option: number, pointer: Pointer, from = NAME_ROW): Promise<void> {
  if (pointer === 'mouse') {
    await holdName(device, name, option, from);
    await device.page.mouse.up();
    return;
  }
  const at = await route(device, name, option, from);
  const finger = await device.page.touchscreen.touchStart(at(0).x, at(0).y);
  for (let step = 1; step <= MOVES; step += 1) await finger.move(at(step).x, at(step).y);
  await finger.end();
}

/** Chooses a name with a tap, then gives her the option with a second tap. */
export async function tapName(device: Device, name: string, option: number): Promise<void> {
  const press = (css: string, text: string | null) =>
    device.page.evaluate(
      (selector, wanted) => [...document.querySelectorAll<HTMLElement>(selector)].find((candidate) => wanted === null || candidate.innerText.includes(wanted))?.click(),
      css,
      text,
    );
  await press(NAME_ROW, name);
  await device.until(`${name} chosen`, async () => (await device.count(`${NAME_ROW}[aria-pressed="true"]`)) === 1);
  await press(`${optionSlot(option)} .slide-option`, null);
}

/** The names shown under an option, with the solid or dashed look of each. */
export function namesUnder(device: Device, option: number): Promise<string[]> {
  return device.texts(`${optionSlot(option)} .member-pick .name-chip`);
}
