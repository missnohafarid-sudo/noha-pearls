import { beforeAll, describe, expect, it } from 'vitest';
import { exportLesson } from '../../src/domain/lessonFormat';
import type { ContentSlide } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { deleteLessonOnPage, exportedFileOnPage, importLessonFile, lessonFileText, storedLessonById, typeIntoField } from '../lessonLane';
import type { World } from '../world';

const TITLE = 'Lesson with a hidden section';
const HIDDEN = '- first secret\nsecond secret';
const ADDED = 'Added from the editor';
const WITH_HIDDEN = { kind: 'content', title: 'Slide with a hidden section', body: 'Visible text', hidden: HIDDEN };
const WITHOUT = { kind: 'content', title: 'Slide without one', body: 'Plain text' };
const BOX = '.slide .slide-hidden__box';
const BUTTON = '.slide .slide-hidden > button';

const slideText = (world: World) => world.admin.texts('.slide').then((texts) => texts.join('\n'));
const buttonState = (world: World) => world.admin.page.$eval(BUTTON, (button) => ({ label: button.textContent, expanded: button.getAttribute('aria-expanded'), controls: button.getAttribute('aria-controls') }));

/** The colour of the bluish token and of the slide, as the browser computes them. */
const colours = (world: World) =>
  world.admin.page.evaluate((boxSelector) => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--info-soft)';
    document.body.append(probe);
    const token = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const box = document.querySelector(boxSelector);
    const slide = document.querySelector('.slide');
    return { token, box: box ? getComputedStyle(box).backgroundColor : '', slide: slide ? getComputedStyle(slide).backgroundColor : '' };
  }, BOX);

/** The hidden section of a normal slide: a button that opens its text in a bluish box and closes it again, kept by the lesson file. */
export function hiddenSectionSteps(world: World): void {
  describe('a hidden section on a normal slide', () => {
    let lessonId = '';
    let copyId = '';

    beforeAll(async () => {
      lessonId = await importLessonFile(world, lessonFileText([WITH_HIDDEN, WITHOUT], TITLE), TITLE);
    });

    it('a slide with hidden text shows the button and not the text', async () => {
      await world.admin.until('the button', () => world.admin.exists(BUTTON));
      expect(await buttonState(world)).toMatchObject({ label: t.slides.view.showHidden, expanded: 'false' });
      expect(await slideText(world)).not.toContain('second secret');
    });

    it('pressing the button shows the text in a bluish box', async () => {
      await world.admin.click(t.slides.view.showHidden, '.slide');
      await world.admin.waitFor('second secret');
      const state = await buttonState(world);
      expect(state).toMatchObject({ label: t.slides.view.hideHidden, expanded: 'true' });
      expect(await world.admin.page.$eval(BOX, (box) => box.id)).toBe(state.controls);
      const { token, box, slide } = await colours(world);
      expect(box).toBe(token);
      expect(box).not.toBe(slide);
      expect(await world.admin.texts(`${BOX} .slide-content__bullet`)).toEqual(['first secret']);
    });

    it('pressing it again hides the text', async () => {
      await world.admin.click(t.slides.view.hideHidden, '.slide');
      await world.admin.until('the text hidden', async () => !(await slideText(world)).includes('second secret'));
      expect(await buttonState(world)).toMatchObject({ label: t.slides.view.showHidden, expanded: 'false' });
    });

    it('moving to another slide and back starts closed, and a slide without hidden text has no button', async () => {
      await world.admin.click(t.slides.view.showHidden, '.slide');
      await world.admin.waitFor('second secret');
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/2`);
      await world.admin.waitFor(WITHOUT.body);
      expect(await world.admin.exists('.slide .slide-hidden')).toBe(false);
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/1`);
      await world.admin.until('the button', () => world.admin.exists(BUTTON));
      expect(await slideText(world)).not.toContain('second secret');
      expect(await buttonState(world)).toMatchObject({ expanded: 'false' });
    });

    it('typing hidden text into the editor field gives the other slide its button', async () => {
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/2`);
      await world.admin.waitFor(WITHOUT.body);
      await typeIntoField(world, t.slides.field.hidden, ADDED, 'textarea');
      await world.admin.until('the button', () => world.admin.exists(BUTTON));
      expect(await slideText(world)).not.toContain(ADDED);
      await world.admin.click(t.slides.view.showHidden, '.slide');
      expect(await world.admin.texts(BOX)).toEqual([ADDED]);
    });

    it('exporting the lesson and importing the file again keeps the hidden text', async () => {
      const stored = await storedLessonById(world, lessonId);
      expect((stored.slides as ContentSlide[]).map((slide) => slide.hidden)).toEqual([HIDDEN, ADDED]);
      const file = await exportedFileOnPage(world, lessonId);
      expect(file.startsWith('```json')).toBe(true);
      expect(JSON.parse(exportLesson(stored)).slides.map((slide: { hidden: string }) => slide.hidden)).toEqual([HIDDEN, ADDED]);
      copyId = await importLessonFile(world, file, TITLE);
      expect(copyId).not.toBe(lessonId);
      expect(((await storedLessonById(world, copyId)).slides as ContentSlide[]).map((slide) => slide.hidden)).toEqual([HIDDEN, ADDED]);
    });

    it('the walkthrough removes its two lessons so that later steps meet the lessons they expect', async () => {
      await deleteLessonOnPage(world, copyId);
      await deleteLessonOnPage(world, lessonId);
    });
  });
}
