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

/** Moves a name from the row (or from under an option) onto an option with a mouse or a finger, in small steps. */
export async function dragName(device: Device, name: string, option: number, pointer: Pointer, from = NAME_ROW): Promise<void> {
  await showOption(device, option);
  const start = await centreOf(device, from, name);
  const end = await centreOf(device, `${optionSlot(option)} .slide-option`, null);
  const at = (step: number): Point => ({ x: start.x + ((end.x - start.x) * step) / MOVES, y: start.y + ((end.y - start.y) * step) / MOVES });
  if (pointer === 'mouse') {
    await device.page.mouse.move(start.x, start.y);
    await device.page.mouse.down();
    for (let step = 1; step <= MOVES; step += 1) await device.page.mouse.move(at(step).x, at(step).y);
    await device.page.mouse.up();
    return;
  }
  const finger = await device.page.touchscreen.touchStart(start.x, start.y);
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
