import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportLesson } from '../../src/domain/lessonFormat';
import type { ChoiceSlide, ContentSlide, TextSlide } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { addPictureLink, answerPictureRequest, boxesOf, deleteLessonOnPage, exportedFileOnPage, importLessonFile, lessonFileText, PICTURE_HOST, storedLessonById, typeIntoField } from '../lessonLane';
import type { World } from '../world';

const TITLE = 'Lesson with pictures';
const PHOTO_ONE = `https://${PICTURE_HOST}/one`;
const PHOTO_TWO = `https://${PICTURE_HOST}/two`;
const PHOTO_THREE = `https://${PICTURE_HOST}/three`;
const PHOTO_FOUR = `https://${PICTURE_HOST}/four`;
const NOT_HTTPS = `http://${PICTURE_HOST}/one`;
const PROMPT = 'Question with a picture';
const CHOSEN = 'Choice question with a picture';
const CONTENT = { kind: 'content', title: 'Slide with pictures', body: 'Some text' };
const WRITTEN = { kind: 'text', title: 'Written question', prompt: PROMPT };
const CHOICE = { kind: 'choice', title: 'Choice question', prompt: CHOSEN, options: ['First option', 'Second option'] };
const WARNING_MARK = `.slide-row [role=img][aria-label="${t.lesson.slides.problem}"]`;
const IMAGES = '.slide .slide-pictures__image';

/** Photos on a content slide and on a written or choice question: shown side by side and centred, edited as a list of links, kept by the lesson file. */
export function slidePicturesSteps(world: World): void {
  describe('pictures on slides', () => {
    let lessonId = '';
    let copyId = '';

    beforeAll(async () => {
      await world.admin.page.setRequestInterception(true);
      world.admin.page.on('request', answerPictureRequest);
      lessonId = await importLessonFile(world, lessonFileText([CONTENT, WRITTEN, CHOICE], TITLE), TITLE);
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

    it('a link added to a choice question shows its picture between the prompt and the first option', async () => {
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/3`);
      await world.admin.waitFor(CHOSEN);
      await addPictureLink(world, PHOTO_FOUR, 0);
      await world.admin.until('the picture', async () => {
        const boxes = await boxesOf(world.admin, IMAGES);
        return boxes.length === 1 && boxes[0].loaded;
      });
      const [picture] = await boxesOf(world.admin, IMAGES);
      const [prompt] = await boxesOf(world.admin, '.slide-question__prompt');
      const [option] = await boxesOf(world.admin, '.slide-option');
      expect(prompt.bottom).toBeLessThanOrEqual(picture.top);
      expect(picture.bottom).toBeLessThanOrEqual(option.top);
    });

    it('the stored lesson holds the pictures of all three slides', async () => {
      const [content, written, chosen] = (await storedLessonById(world, lessonId)).slides as [ContentSlide, TextSlide, ChoiceSlide];
      expect(content.images).toEqual([PHOTO_ONE, PHOTO_TWO]);
      expect(written.images).toEqual([PHOTO_THREE]);
      expect(chosen.images).toEqual([PHOTO_FOUR]);
      expect(content).not.toHaveProperty('imageUrl');
    });

    it('exporting the lesson and importing the file again keeps the pictures of all three slides', async () => {
      const file = await exportedFileOnPage(world, lessonId);
      expect(file.startsWith('```json')).toBe(true);
      expect(JSON.parse(exportLesson(await storedLessonById(world, lessonId))).slides.map((slide: { images: string[] }) => slide.images)).toEqual([[PHOTO_ONE, PHOTO_TWO], [PHOTO_THREE], [PHOTO_FOUR]]);
      copyId = await importLessonFile(world, file, TITLE);
      expect(copyId).not.toBe(lessonId);
      const [content, written, chosen] = (await storedLessonById(world, copyId)).slides as [ContentSlide, TextSlide, ChoiceSlide];
      expect(content.images).toEqual([PHOTO_ONE, PHOTO_TWO]);
      expect(written.images).toEqual([PHOTO_THREE]);
      expect(chosen.images).toEqual([PHOTO_FOUR]);
    });

    it('the walkthrough removes its two lessons so that later steps meet the lessons they expect', async () => {
      await deleteLessonOnPage(world, copyId);
      await deleteLessonOnPage(world, lessonId);
    });
  });

  describe('pictures as the options of a choice question', () => {
    const OPTIONS_TITLE = 'Lesson with picture options';
    const PICTURES = ['one', 'two', 'three', 'four'].map((name) => `https://${PICTURE_HOST}/${name}.png`);
    const FOUR_PICTURES = { kind: 'choice', title: 'Four pictures', prompt: 'Which one?', options: PICTURES };
    const MIXED = { kind: 'choice', title: 'Mixed options', prompt: 'Mixed?', options: [PICTURES[0], 'Only words', PICTURES[1]] };
    const WORDS = { kind: 'choice', title: 'Words only', prompt: 'Words?', options: ['First words', 'Second words', 'Third words'] };
    const OPTION = '.slide .slide-option';
    const OPTION_IMAGES = '.slide .slide-option__picture';
    let lessonId = '';

    const openSlide = async (number: number, prompt: string) => {
      await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/${number}`);
      await world.admin.waitFor(prompt);
    };

    beforeAll(async () => {
      await world.admin.page.setRequestInterception(true);
      world.admin.page.on('request', answerPictureRequest);
      lessonId = await importLessonFile(world, lessonFileText([FOUR_PICTURES, MIXED, WORDS], OPTIONS_TITLE), OPTIONS_TITLE);
    });

    afterAll(async () => {
      world.admin.page.off('request', answerPictureRequest);
      await world.admin.page.setRequestInterception(false);
    });

    it('four picture options show four loaded pictures in two rows of two, each with its letter', async () => {
      await openSlide(1, FOUR_PICTURES.prompt);
      await world.admin.until('four loaded pictures', async () => {
        const boxes = await boxesOf(world.admin, OPTION_IMAGES);
        return boxes.length === 4 && boxes.every((box) => box.loaded);
      });
      const [a, b, c, d] = await boxesOf(world.admin, OPTION);
      expect(Math.abs(a.top - b.top)).toBeLessThan(2);
      expect(Math.abs(c.top - d.top)).toBeLessThan(2);
      expect(a.bottom).toBeLessThanOrEqual(c.top);
      expect(Math.abs(a.left - c.left)).toBeLessThan(2);
      expect(await world.admin.count('.slide .slide-option__letter')).toBe(4);
    });

    it('two picture options and one text option all sit inside the grid', async () => {
      await openSlide(2, MIXED.prompt);
      await world.admin.until('two loaded pictures', async () => {
        const boxes = await boxesOf(world.admin, OPTION_IMAGES);
        return boxes.length === 2 && boxes.every((box) => box.loaded);
      });
      const [grid] = await boxesOf(world.admin, '.slide .slide-options');
      const options = await boxesOf(world.admin, OPTION);
      expect(options).toHaveLength(3);
      for (const option of options) {
        expect(option.left).toBeGreaterThanOrEqual(grid.left - 1);
        expect(option.right).toBeLessThanOrEqual(grid.right + 1);
      }
      expect(Math.abs(options[0].top - options[1].top)).toBeLessThan(2);
    });

    it('a question with only text options keeps its full-width rows', async () => {
      await openSlide(3, WORDS.prompt);
      expect(await world.admin.count(OPTION_IMAGES)).toBe(0);
      const [grid] = await boxesOf(world.admin, '.slide .slide-options');
      const options = await boxesOf(world.admin, OPTION);
      expect(options).toHaveLength(3);
      for (const option of options) {
        expect(Math.abs(option.left - grid.left)).toBeLessThan(2);
        expect(Math.abs(option.right - grid.right)).toBeLessThan(2);
      }
    });

    it('the exported file keeps the option links as written', async () => {
      const file = await exportedFileOnPage(world, lessonId);
      const slides = JSON.parse(exportLesson(await storedLessonById(world, lessonId))).slides as { options: string[] }[];
      expect(slides.map((slide) => slide.options)).toEqual([FOUR_PICTURES.options, MIXED.options, WORDS.options]);
      expect(file.startsWith('```json')).toBe(true);
      expect(file).toContain(PICTURES[0]);
    });

    it('the walkthrough removes its lesson so that later steps meet the lessons they expect', async () => {
      await deleteLessonOnPage(world, lessonId);
    });
  });
}
