import { beforeAll, describe, expect, it } from 'vitest';
import { pickOption } from '../actions';
import type { Slide } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { PANEL, deleteLessonOnPage, exportedFileOnPage, importLessonFile, lessonFileText, storedLessonById, typeIntoField } from '../lessonLane';
import type { World } from '../world';

const TITLE = 'Lesson with badges';
const TAG = 'Warm up';
const WITH_BADGES = {
  kind: 'content',
  title: 'Slide with badges',
  tag: TAG,
  body: 'Badge text body',
  badges: [{ text: 'First goal', color: 'gold' }, { text: 'Second goal', color: 'black' }],
};
const WITHOUT = { kind: 'content', title: 'Slide without badges', body: 'Plain body' };
const BADGES = '.slide .slide-badge';
const LABELS = '.slide .slide__labels > *';
const BADGE_LIST = `${PANEL} fieldset.field`;
const ADDED = 'Added from the editor';

const classesOf = (world: World, selector: string) => world.admin.page.$$eval(selector, (elements) => elements.map((element) => element.className));
const badgesOf = (slide: Slide) => slide.badges;

/** Coloured badges beside a slide's tag: drawn in order with their colour, edited as a list with our drop-down, kept by the lesson file. */
export function slideBadgesSteps(world: World): void {
  describe('coloured badges on a slide', () => {
    let lessonId = '';
    let copyId = '';

    beforeAll(async () => {
      lessonId = await importLessonFile(world, lessonFileText([WITH_BADGES, WITHOUT], TITLE), TITLE);
    });

    it('a slide with a tag and two badges shows the tag, then the two badges in order, each in its colour', async () => {
      await world.admin.until('the two badges', async () => (await world.admin.count(BADGES)) === 2);
      expect(await world.admin.texts(LABELS)).toEqual([TAG, 'First goal', 'Second goal']);
      expect(await classesOf(world, BADGES)).toEqual(['slide-badge slide-badge--gold', 'slide-badge slide-badge--black']);
    });

    it('a slide without badges shows none', async () => {
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/2`);
      await world.admin.waitFor(WITHOUT.body);
      expect(await world.admin.count(BADGES)).toBe(0);
    });

    it('adding a badge in the editor shows it on the slide in the colour chosen, and removing it takes it away', async () => {
      await world.admin.click(t.common.add, BADGE_LIST);
      await typeIntoField(world, t.slides.field.badges, ADDED, 'input', 0);
      await world.admin.until('the badge', async () => (await world.admin.count(BADGES)) === 1);
      expect(await classesOf(world, BADGES)).toEqual(['slide-badge slide-badge--purple']);
      await pickOption(world.admin, { ariaLabel: t.slides.field.badgeColor(1) }, t.common.pearlShade.pink);
      await world.admin.until('the pink badge', async () => (await classesOf(world, BADGES)).join() === 'slide-badge slide-badge--pink');
      expect(await world.admin.texts(BADGES)).toEqual([ADDED]);
      await world.admin.click(t.common.remove, BADGE_LIST);
      await world.admin.until('no badge', async () => (await world.admin.count(BADGES)) === 0);
    });

    it('a badge added again stays for the export', async () => {
      await world.admin.click(t.common.add, BADGE_LIST);
      await typeIntoField(world, t.slides.field.badges, ADDED, 'input', 0);
      await pickOption(world.admin, { ariaLabel: t.slides.field.badgeColor(1) }, t.common.pearlShade.cream);
      await world.admin.until('the cream badge', async () => (await classesOf(world, BADGES)).join() === 'slide-badge slide-badge--cream');
    });

    it('exporting the lesson and importing the file again keeps the badges', async () => {
      const expected = [[{ text: 'First goal', color: 'gold' }, { text: 'Second goal', color: 'black' }], [{ text: ADDED, color: 'cream' }]];
      expect((await storedLessonById(world, lessonId)).slides.map(badgesOf)).toEqual(expected);
      const file = await exportedFileOnPage(world, lessonId);
      copyId = await importLessonFile(world, file, TITLE);
      expect(copyId).not.toBe(lessonId);
      expect((await storedLessonById(world, copyId)).slides.map(badgesOf)).toEqual(expected);
    });

    it('the walkthrough removes its two lessons so that later steps meet the lessons they expect', async () => {
      await deleteLessonOnPage(world, copyId);
      await deleteLessonOnPage(world, lessonId);
    });
  });
}
