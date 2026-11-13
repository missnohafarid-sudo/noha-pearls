import { beforeAll, describe, expect, it } from 'vitest';
import type { ContentSlide } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { deleteLessonOnPage, importLessonFile, lessonFileText, storedLessonById } from '../lessonLane';
import type { World } from '../world';

const TITLE = 'Lesson for copying slides';
const FIRST = { kind: 'content', title: 'First slide', tag: 'Start', body: '- one\ntwo' };
const LAST = { kind: 'content', title: 'Last slide', body: 'end' };
const ROW = (n: number) => `.slide-list li:nth-child(${n})`;

/** Copying a slide in the lesson maker: the copy lands right below it, is opened, and can be removed again. */
export function slideCopySteps(world: World): void {
  describe('copying a slide', () => {
    let lessonId = '';

    beforeAll(async () => {
      lessonId = await importLessonFile(world, lessonFileText([FIRST, LAST], TITLE), TITLE);
    });

    it('pressing the copy button puts an identical slide right below and opens it', async () => {
      await world.admin.click(t.lesson.slides.copy, ROW(1));
      await world.admin.until('the copy opened', async () => world.admin.page.url().endsWith('/2'));
      await world.admin.until('three slides in the list', async () => (await world.admin.count('.slide-list li')) === 3);
      expect(await world.admin.texts('.slide-list .slide-row__title')).toEqual([FIRST.title, FIRST.title, LAST.title]);
      expect(await world.admin.texts('.slide__title')).toEqual([FIRST.title]);
      expect(await world.admin.page.$eval(ROW(2), (row) => row.getAttribute('aria-current'))).toBe('true');
    });

    it('the stored lesson has one more slide whose content equals the original', async () => {
      await world.admin.until('three slides stored', async () => (await storedLessonById(world, lessonId)).slides.length === 3);
      const [original, copy, last] = (await storedLessonById(world, lessonId)).slides as ContentSlide[];
      expect(copy.id).not.toBe(original.id);
      expect({ ...copy, id: '' }).toEqual({ ...original, id: '' });
      expect(last.title).toBe(LAST.title);
    });

    it('removing the copy leaves the lesson as it was', async () => {
      await world.admin.click(t.lesson.slides.delete, ROW(2));
      await world.admin.click(t.common.confirm, ROW(2));
      await world.admin.until('two slides stored', async () => (await storedLessonById(world, lessonId)).slides.length === 2);
      expect((await storedLessonById(world, lessonId)).slides.map((slide) => slide.title)).toEqual([FIRST.title, LAST.title]);
    });

    it('the walkthrough removes its lesson so that later steps meet the lessons they expect', async () => {
      await deleteLessonOnPage(world, lessonId);
    });
  });
}
