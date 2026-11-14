import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContentSlide } from '../../src/domain/models';
import { HIDDEN_FENCE } from '../../src/domain/slideText';
import { t } from '../../src/i18n';
import { answerPictureRequest, boxesOf, deleteLessonOnPage, exportedFileOnPage, importLessonFile, lessonFileText, PICTURE_HOST, storedLessonById, typeIntoField } from '../lessonLane';
import type { World } from '../world';

const TITLE = 'Lesson with hidden parts';
const F = HIDDEN_FENCE;
const PHOTO = `https://${PICTURE_HOST}/secret`;
const MIDDLE_PHOTO = `https://${PICTURE_HOST}/middle`;
const BODY = ['visible one', F, '- secret A', PHOTO, F, 'visible two', F, 'secret B', F, 'visible three'].join('\n');
const BOTTOM = 'bottom secret';
const WITH_PARTS = { kind: 'content', title: 'Slide with hidden parts', body: BODY, hidden: BOTTOM };
const WITH_PICTURE_LINE = { kind: 'content', title: 'Slide with a picture line', body: `before the picture\n${MIDDLE_PHOTO}\nafter the picture` };
const PLAIN = { kind: 'content', title: 'Plain slide', body: 'plain text' };
const UNCLOSED = ['intro line', F, 'late one', 'late two'].join('\n');
const BUTTONS = '.slide .slide-hidden > button';
const OPEN_IMAGES = '.slide .slide-hidden__box .slide-pictures__image';

interface Piece {
  what: string;
  top: number;
}

/** The slide's own text from top to bottom: each line, each picture, and each hidden part as "[button]"; what sits inside a hidden part is left out. */
const outline = (world: World): Promise<Piece[]> =>
  world.admin.page.evaluate(() => {
    const pieces: { what: string; top: number }[] = [];
    const walk = (node: Element) => {
      for (const child of node.children) {
        const top = child.getBoundingClientRect().top;
        if (child.classList.contains('slide-hidden')) pieces.push({ what: '[button]', top });
        else if (child.classList.contains('slide-pictures')) pieces.push({ what: '[picture]', top });
        else if (child.classList.contains('slide-content__text')) walk(child);
        else if (child.tagName === 'P') pieces.push({ what: (child as HTMLElement).innerText, top });
      }
    };
    const root = document.querySelector('.slide-content');
    if (root) walk(root);
    return pieces;
  });

const outlineWhats = async (world: World) => (await outline(world)).map((piece) => piece.what);
const slideText = (world: World) => world.admin.texts('.slide').then((texts) => texts.join('\n'));
const press = (world: World, index: number) => world.admin.page.evaluate((at, selector) => document.querySelectorAll<HTMLButtonElement>(selector)[at]?.click(), index, BUTTONS);
const expandedStates = (world: World) => world.admin.page.$$eval(BUTTONS, (buttons) => buttons.map((button) => button.getAttribute('aria-expanded')));
const bodies = (slides: unknown) => (slides as ContentSlide[]).map((slide) => slide.body);

/** Hidden parts written inside a slide's text: each has its own button where it sits, may hold a picture, and is kept by the lesson file. */
export function inlineHiddenSteps(world: World): void {
  describe('hidden parts inside the text of a slide', () => {
    let lessonId = '';
    let copyId = '';

    beforeAll(async () => {
      await world.admin.page.setRequestInterception(true);
      world.admin.page.on('request', answerPictureRequest);
      lessonId = await importLessonFile(world, lessonFileText([WITH_PARTS, WITH_PICTURE_LINE, PLAIN], TITLE), TITLE);
    });

    afterAll(async () => {
      world.admin.page.off('request', answerPictureRequest);
      await world.admin.page.setRequestInterception(false);
    });

    it('the slide shows three buttons between its visible lines, in order, and none of the secrets', async () => {
      await world.admin.until('three buttons', async () => (await world.admin.count(BUTTONS)) === 3);
      const pieces = await outline(world);
      expect(pieces.map((piece) => piece.what)).toEqual(['visible one', '[button]', 'visible two', '[button]', 'visible three', '[button]']);
      const tops = pieces.map((piece) => piece.top);
      expect(tops).toEqual([...tops].sort((a, b) => a - b));
      const text = await slideText(world);
      for (const secret of ['secret A', 'secret B', BOTTOM]) expect(text).not.toContain(secret);
      expect(await world.admin.count(OPEN_IMAGES)).toBe(0);
    });

    it('pressing the first button shows secret A and its picture, and not secret B', async () => {
      await press(world, 0);
      await world.admin.waitFor('secret A');
      await world.admin.until('the picture', async () => {
        const boxes = await boxesOf(world.admin, OPEN_IMAGES);
        return boxes.length === 1 && boxes[0].loaded;
      });
      expect(await world.admin.texts('.slide .slide-hidden__box .slide-content__bullet')).toEqual(['secret A']);
      expect(await slideText(world)).not.toContain('secret B');
      expect(await expandedStates(world)).toEqual(['true', 'false', 'false']);
    });

    it('pressing the second shows secret B while the first stays open, and closing the first leaves the second open', async () => {
      await press(world, 1);
      await world.admin.waitFor('secret B');
      expect(await slideText(world)).toContain('secret A');
      expect(await expandedStates(world)).toEqual(['true', 'true', 'false']);
      await press(world, 0);
      await world.admin.until('secret A hidden', async () => !(await slideText(world)).includes('secret A'));
      expect(await slideText(world)).toContain('secret B');
      expect(await expandedStates(world)).toEqual(['false', 'true', 'false']);
    });

    it('a picture line between two visible lines draws the picture between them', async () => {
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/2`);
      await world.admin.waitFor('after the picture');
      await world.admin.until('the picture', async () => {
        const boxes = await boxesOf(world.admin, '.slide .slide-pictures__image');
        return boxes.length === 1 && boxes[0].loaded;
      });
      const pieces = await outline(world);
      expect(pieces.map((piece) => piece.what)).toEqual(['before the picture', '[picture]', 'after the picture']);
      const tops = pieces.map((piece) => piece.top);
      expect(tops).toEqual([...tops].sort((a, b) => a - b));
    });

    it('typing a body with one unclosed fence hides everything after it behind one button', async () => {
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/3`);
      await world.admin.waitFor(PLAIN.body);
      await typeIntoField(world, t.slides.field.body, UNCLOSED, 'textarea');
      await world.admin.until('one button', async () => (await world.admin.count(BUTTONS)) === 1);
      expect(await outlineWhats(world)).toEqual(['intro line', '[button]']);
      expect(await slideText(world)).not.toContain('late one');
      await press(world, 0);
      await world.admin.waitFor('late two');
      expect(await world.admin.texts('.slide .slide-hidden__box')).toEqual(['late one\nlate two']);
    });

    it('exporting the lesson and importing the file again keeps the text exactly', async () => {
      const expected = [BODY, WITH_PICTURE_LINE.body, UNCLOSED];
      expect(bodies((await storedLessonById(world, lessonId)).slides)).toEqual(expected);
      const file = await exportedFileOnPage(world, lessonId);
      copyId = await importLessonFile(world, file, TITLE);
      expect(copyId).not.toBe(lessonId);
      expect(bodies((await storedLessonById(world, copyId)).slides)).toEqual(expected);
    });

    it('the walkthrough removes its two lessons so that later steps meet the lessons they expect', async () => {
      await deleteLessonOnPage(world, copyId);
      await deleteLessonOnPage(world, lessonId);
    });
  });
}
