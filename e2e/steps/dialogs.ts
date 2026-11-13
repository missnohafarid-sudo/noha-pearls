import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { DESKTOP, type Device } from '../device';
import { SAMPLE } from '../sample';
import type { World } from '../world';

const SMALL = { width: 390, height: 600 };
const DIALOG = 'dialog[open]';
const BODY = `${DIALOG} .dialog__body`;
const EXTRA_DESTINATIONS = 30;
/** Pixels the box may sit outside the window and still count as inside: the browser rounds layout to fractions of a pixel. */
const ROUNDING = 1;

interface Seen {
  titleInside: boolean;
  footInside: boolean;
  buttonsInside: boolean;
  bodyScrolls: boolean;
  bodyTop: number;
  dialogTop: number;
}

const seen = (device: Device): Promise<Seen> =>
  device.page.evaluate(
    (rounding) => {
      const dialog = document.querySelector<HTMLElement>('dialog[open]')!;
      const body = dialog.querySelector<HTMLElement>('.dialog__body')!;
      const inside = (box: DOMRect) => box.top >= -rounding && box.bottom <= window.innerHeight + rounding;
      const foot = dialog.querySelector<HTMLElement>('.dialog__foot')!;
      return {
        titleInside: inside(dialog.querySelector('.dialog__title')!.getBoundingClientRect()),
        footInside: inside(foot.getBoundingClientRect()),
        buttonsInside: [...foot.querySelectorAll('button')].every((button) => inside(button.getBoundingClientRect())),
        bodyScrolls: body.scrollHeight > body.clientHeight,
        bodyTop: body.scrollTop,
        dialogTop: dialog.scrollTop,
      };
    },
    ROUNDING,
  );

async function expectKept(world: World, what: string): Promise<void> {
  const before = await seen(world.admin);
  expect(before, `${what} before scrolling`).toMatchObject({ titleInside: true, footInside: true, buttonsInside: true, bodyScrolls: true, bodyTop: 0 });
  await world.admin.page.$eval(BODY, (body) => body.scrollTo({ top: body.scrollHeight }));
  const after = await seen(world.admin);
  expect(after.bodyTop, `${what}: the body is what scrolls`).toBeGreaterThan(0);
  expect(after, `${what} after scrolling to the end`).toMatchObject({ titleInside: true, footInside: true, buttonsInside: true, dialogTop: 0 });
}

async function closeDialog(world: World): Promise<void> {
  await world.admin.click(t.common.close, DIALOG);
  await world.admin.until('the dialog closed', async () => !(await world.admin.exists(DIALOG)));
}

/** On a small screen a dialog keeps its title and its final buttons in view; only its body scrolls. */
export function dialogsSteps(world: World): void {
  let startedAt = '';

  it('the import dialog keeps its title and buttons in view at 390×600 while its body scrolls', async () => {
    startedAt = world.admin.page.url();
    await world.admin.goto('#/');
    await world.admin.click(t.home.panel.importLesson);
    await world.admin.until('the import dialog', () => world.admin.exists(DIALOG));
    await world.admin.page.setViewport(SMALL);
    await expectKept(world, 'import dialog');
    await closeDialog(world);
  });

  it('the move dialog keeps its title and close button in view with a long list', async () => {
    await world.admin.page.evaluate((label) => {
      [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === label)?.click();
    }, t.library.moveLesson(SAMPLE.title));
    await world.admin.until('the move dialog', () => world.admin.exists(`${DIALOG} .move-list`));
    await world.admin.page.$eval(`${DIALOG} .move-list--root > li`, (item, copies) => {
      for (let i = 0; i < copies; i += 1) item.parentElement!.append(item.cloneNode(true));
    }, EXTRA_DESTINATIONS);
    await expectKept(world, 'move dialog');
    await closeDialog(world);
  });

  it('the viewport and the page are put back as the next lane expects', async () => {
    await world.admin.page.setViewport(DESKTOP);
    await world.admin.page.goto(startedAt);
    await world.admin.until('the lesson page as it was', async () => world.admin.page.url() === startedAt && (await world.admin.exists('.slide')));
  });
}
