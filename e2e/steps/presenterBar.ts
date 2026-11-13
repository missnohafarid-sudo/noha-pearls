import type { KeyInput } from 'puppeteer';
import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { Device } from '../device';
import { SAMPLE } from '../sample';
import { storedRecords, type World } from '../world';

const BAR = '.presenter__bar';
const KEYS: KeyInput[] = ['ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Space'];

interface StoredSession {
  code: string;
  slideIndex: number;
}

/** Where a bar button is (found by its exact words) and whether it is enabled; null when the bar has no such button. */
const buttonOf = (device: Device, label: string) =>
  device.page.evaluate(
    (wanted, barSelector) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(`${barSelector} button`)].find((candidate) => candidate.innerText.trim() === wanted);
      if (!button) return null;
      const box = button.getBoundingClientRect();
      const inside = box.width > 0 && box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, enabled: !button.disabled, inside, pressed: button.getAttribute('aria-pressed') };
    },
    label,
    BAR,
  );

async function mustButton(device: Device, label: string) {
  await device.until(`the bar button "${label}"`, async () => (await buttonOf(device, label)) !== null);
  return (await buttonOf(device, label))!;
}

/** A real mouse press, which is what full screen needs and what a hand on a projector does. */
async function pressWithMouse(device: Device, label: string): Promise<void> {
  const button = await mustButton(device, label);
  await device.page.mouse.click(button.x, button.y);
}

const chipInside = (device: Device) =>
  device.page.evaluate(() => {
    const box = document.querySelector('.session__stage .class-code')?.getBoundingClientRect();
    return box !== undefined && box.width > 0 && box.top >= 0 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth;
  });

/** The presenting bar under the stage: always on screen, in full screen too, and still while the join codes replace the slide. */
export function presenterBarSteps(world: World): void {
  const storedIndex = async () => (await storedRecords<StoredSession>(world.admin, 'sessions')).find((session) => session.code === world.firstClassCode)!.slideIndex;
  const counter = (index: number) => t.common.slideOf(index + 1, SAMPLE.slides.length);

  it('the next button is on screen without scrolling, and the class code is on the stage', async () => {
    await world.admin.page.evaluate(() => window.scrollTo(0, 0));
    expect((await mustButton(world.admin, t.common.next)).inside).toBe(true);
    expect((await mustButton(world.admin, t.common.fullscreen)).inside).toBe(true);
    expect(await world.admin.texts('.session__stage .class-code')).toEqual([expect.stringContaining(world.firstClassCode)]);
    expect(await chipInside(world.admin)).toBe(true);
  });

  it('showing the join codes changes the button words, turns previous and next off, and the keys no longer move the slide', async () => {
    const before = await storedIndex();
    expect(before).toBe(world.stageSlide);
    await world.admin.click(t.session.showJoinCodes, BAR);
    await world.admin.waitFor(t.session.hideJoinCodes);
    expect(await buttonOf(world.admin, t.session.showJoinCodes)).toBeNull();
    expect(await mustButton(world.admin, t.session.hideJoinCodes)).toMatchObject({ pressed: 'true' });
    expect(await mustButton(world.admin, t.common.previous)).toMatchObject({ enabled: false });
    expect(await mustButton(world.admin, t.common.next)).toMatchObject({ enabled: false });
    expect(await buttonOf(world.admin, t.session.reveal)).toBeNull();
    expect(await buttonOf(world.admin, t.session.scan)).toBeNull();
    await world.admin.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const key of KEYS) await world.admin.page.keyboard.press(key);
    await world.admin.holds('the same slide counter', () => world.admin.has(counter(before)));
    expect(await storedIndex()).toBe(before);
  });

  it('hiding the join codes brings the buttons back on the same slide', async () => {
    await world.admin.click(t.session.hideJoinCodes, BAR);
    await world.admin.waitFor(t.session.showJoinCodes);
    expect(await mustButton(world.admin, t.session.showJoinCodes)).toMatchObject({ pressed: 'false' });
    expect(await mustButton(world.admin, t.common.previous)).toMatchObject({ enabled: true });
    expect(await mustButton(world.admin, t.common.next)).toMatchObject({ enabled: true });
    await world.admin.waitFor(counter(world.stageSlide));
    expect(await storedIndex()).toBe(world.stageSlide);
  });

  it('in full screen the bar and the class code are on screen, and the mouse moves the slides', async () => {
    await world.admin.page.bringToFront();
    await pressWithMouse(world.admin, t.common.fullscreen);
    await world.admin.until('the presenter in full screen', () => world.admin.page.evaluate(() => document.fullscreenElement?.classList.contains('presenter') === true));
    expect((await mustButton(world.admin, t.common.exitFullscreen)).inside).toBe(true);
    expect((await mustButton(world.admin, t.common.next)).inside).toBe(true);
    expect(await chipInside(world.admin)).toBe(true);
    await pressWithMouse(world.admin, t.common.next);
    await world.admin.waitFor(counter(world.stageSlide + 1));
    expect(await storedIndex()).toBe(world.stageSlide + 1);
    await pressWithMouse(world.admin, t.common.previous);
    await world.admin.waitFor(counter(world.stageSlide));
    expect(await storedIndex()).toBe(world.stageSlide);
  });

  it('leaving full screen puts the page back', async () => {
    await pressWithMouse(world.admin, t.common.exitFullscreen);
    await world.admin.until('full screen left', () => world.admin.page.evaluate(() => document.fullscreenElement === null));
    expect((await mustButton(world.admin, t.common.fullscreen)).inside).toBe(true);
    expect(await world.admin.exists('.presenter__bar')).toBe(true);
    expect(await buttonOf(world.admin, t.session.hideJoinCodes)).toBeNull();
  });
}
