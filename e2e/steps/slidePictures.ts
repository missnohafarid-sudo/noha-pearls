import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportLesson } from '../../src/domain/lessonFormat';
import type { ContentSlide, TextSlide } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { addPictureLink, answerPictureRequest, boxesOf, deleteLessonOnPage, exportedFileOnPage, importLessonFile, lessonFileText, PICTURE_HOST, storedLessonById, typeIntoField } from '../lessonLane';
import type { World } from '../world';

const TITLE = 'Lesson with pictures';
const PHOTO_ONE = `https://${PICTURE_HOST}/one`;
const PHOTO_TWO = `https://${PICTURE_HOST}/two`;
const PHOTO_THREE = `https://${PICTURE_HOST}/three`;
const NOT_HTTPS = `http://${PICTURE_HOST}/one`;
const PROMPT = 'Question with a picture';
const CONTENT = { kind: 'content', title: 'Slide with pictures', body: 'Some text' };
const WRITTEN = { kind: 'text', title: 'Written question', prompt: PROMPT };
const WARNING_MARK = `.slide-row [role=img][aria-label="${t.lesson.slides.problem}"]`;
const IMAGES = '.slide .slide-pictures__image';

/** Photos on a content slide and on a written question: shown side by side and centred, edited as a list of links, kept by the lesson file. */
export function slidePicturesSteps(world: World): void {
  describe('pictures on slides', () => {
    let lessonId = '';
    let copyId = '';

    beforeAll(async () => {
      await world.admin.page.setRequestInterception(true);
      world.admin.page.on('request', answerPictureRequest);
      lessonId = await importLessonFile(world, lessonFileText([CONTENT, WRITTEN], TITLE), TITLE);
    });

    afterAll(async () => {
      world.admin.page.off('request', answerPictureRequest);
      await world.admin.page.setRequestInterception(false);
    });

    it('two links added to a normal slide show two pictures side by side, centred under the text', async () => {
      await addPictureLink(world, PHOTO_ONE, 0);
      await addPictureLink(world, PHOTO_TWO, 1);
      await world.admin.until('two loaded pictures', async () => {
        const boxes = await boxesOf(world.admin, IMAGES);
        return boxes.length === 2 && boxes.every((box) => box.loaded);
      });
      const [a, b] = await boxesOf(world.admin, IMAGES);
      expect(Math.abs(a.top - b.top)).toBeLessThan(2);
      const [first, second] = a.left < b.left ? [a, b] : [b, a];
      expect(first.right).toBeLessThanOrEqual(second.left);
      expect(second.left - first.right).toBeLessThan(40);
      const [slide] = await boxesOf(world.admin, '.slide-content');
      expect(Math.abs((first.left + second.right) / 2 - (slide.left + slide.right) / 2)).toBeLessThan(2);
      const [text] = await boxesOf(world.admin, '.slide-content__text');
      expect(text.bottom).toBeLessThanOrEqual(a.top);
    });

    it('a link that is not https is refused the way a media slide refuses one: no picture and the warning mark', async () => {
      await typeIntoField(world, t.slides.field.images, NOT_HTTPS, 'input', 1);
      await world.admin.until('one picture left', async () => (await world.admin.count(IMAGES)) === 1);
      await world.admin.until('the warning mark in the slide list', () => world.admin.exists(WARNING_MARK));
      await typeIntoField(world, t.slides.field.images, PHOTO_TWO, 'input', 1);
      await world.admin.until('two pictures again', async () => (await world.admin.count(IMAGES)) === 2);
      await world.admin.until('no warning mark', async () => !(await world.admin.exists(WARNING_MARK)));
    });

    it('a link added to a written-answer question shows its picture below the prompt', async () => {
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/2`);
      await world.admin.waitFor(PROMPT);
      await addPictureLink(world, PHOTO_THREE, 0);
      await world.admin.until('the picture', async () => {
        const boxes = await boxesOf(world.admin, IMAGES);
        return boxes.length === 1 && boxes[0].loaded;
      });
      const [picture] = await boxesOf(world.admin, IMAGES);
      const [prompt] = await boxesOf(world.admin, '.slide-question__prompt');
      expect(prompt.bottom).toBeLessThanOrEqual(picture.top);
    });

    it('the stored lesson holds the pictures of both slides', async () => {
      const [content, written] = (await storedLessonById(world, lessonId)).slides as [ContentSlide, TextSlide];
      expect(content.images).toEqual([PHOTO_ONE, PHOTO_TWO]);
      expect(written.images).toEqual([PHOTO_THREE]);
      expect(content).not.toHaveProperty('imageUrl');
    });

    it('exporting the lesson and importing the file again keeps the pictures of both slides', async () => {
      const file = await exportedFileOnPage(world, lessonId);
      expect(file.startsWith('```json')).toBe(true);
      expect(JSON.parse(exportLesson(await storedLessonById(world, lessonId))).slides.map((slide: { images: string[] }) => slide.images)).toEqual([[PHOTO_ONE, PHOTO_TWO], [PHOTO_THREE]]);
      copyId = await importLessonFile(world, file, TITLE);
      expect(copyId).not.toBe(lessonId);
      const [content, written] = (await storedLessonById(world, copyId)).slides as [ContentSlide, TextSlide];
      expect(content.images).toEqual([PHOTO_ONE, PHOTO_TWO]);
      expect(written.images).toEqual([PHOTO_THREE]);
    });

    it('the walkthrough removes its two lessons so that later steps meet the lessons they expect', async () => {
      await deleteLessonOnPage(world, copyId);
      await deleteLessonOnPage(world, lessonId);
    });
  });
}
