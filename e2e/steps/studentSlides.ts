import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Lesson } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { presentUpTo } from '../actions';
import { addPictureLink, answerPictureRequest, boxesOf, PANEL, PICTURE_HOST, typeIntoField } from '../lessonLane';
import { SAMPLE, slideText } from '../sample';
import { storedRecords, type World } from '../world';

const WRITTEN_SLIDE = 9;
const CONTENT_SLIDE = 10;
const PHOTO = `https://${PICTURE_HOST}/for-the-student`;
const SECRET = 'A secret line for the student';
const PICTURE_LIST = `${PANEL} fieldset.field`;

/** What the teacher's slides show on a student's phone in the running class: a written question's picture, and a hidden section's button. */
export function studentSlidesSteps(world: World): void {
  describe('pictures and hidden sections on a student\'s phone', () => {
    const editSlide = async (position: number) => {
      const lesson = (await storedRecords<Lesson>(world.admin, 'lessons')).find((stored) => stored.title === SAMPLE.title)!;
      await world.admin.goto(`#/lesson/${encodeURIComponent(lesson.id)}/${position + 1}`);
      await world.admin.waitFor(SAMPLE.slides[position].title);
    };
    const backToClass = async () => {
      await world.admin.goto(`#/session/${world.firstClassCode}`);
      await world.admin.waitFor(t.session.pacingTitle);
    };

    beforeAll(async () => {
      await world.student.page.setRequestInterception(true);
      world.student.page.on('request', answerPictureRequest);
    });

    afterAll(async () => {
      world.student.page.off('request', answerPictureRequest);
      await world.student.page.setRequestInterception(false);
    });

    it('a picture on the written question sits between its prompt and the answer box on the student\'s phone', async () => {
      await editSlide(WRITTEN_SLIDE);
      await addPictureLink(world, PHOTO, 0);
      await backToClass();
      await presentUpTo(world, WRITTEN_SLIDE);
      await world.student.waitFor(slideText(WRITTEN_SLIDE));
      await world.student.until('the picture on the phone', async () => {
        const [picture] = await boxesOf(world.student, '.slide-pictures__image');
        return picture?.loaded === true;
      });
      const [prompt] = await boxesOf(world.student, '.slide-question__prompt');
      const [picture] = await boxesOf(world.student, '.slide-pictures__image');
      const [answerBox] = await boxesOf(world.student, 'textarea');
      expect(prompt.bottom).toBeLessThanOrEqual(picture.top);
      expect(picture.bottom).toBeLessThanOrEqual(answerBox.top);
    });

    it('the hidden section\'s button opens its text on the student\'s phone', async () => {
      await editSlide(CONTENT_SLIDE);
      await typeIntoField(world, t.slides.field.hidden, SECRET, 'textarea');
      await backToClass();
      await presentUpTo(world, CONTENT_SLIDE);
      await world.student.waitFor(t.slides.view.showHidden);
      expect(await world.student.has(SECRET)).toBe(false);
      await world.student.click(t.slides.view.showHidden, '.slide');
      await world.student.waitFor(SECRET);
    });

    it('the walkthrough takes both additions off the sample lesson and brings the class back to the slide later steps expect', async () => {
      await editSlide(CONTENT_SLIDE);
      await typeIntoField(world, t.slides.field.hidden, '', 'textarea');
      await editSlide(WRITTEN_SLIDE);
      await world.admin.click(t.common.remove, PICTURE_LIST);
      await backToClass();
      for (const previous of [CONTENT_SLIDE - 1, CONTENT_SLIDE - 2]) {
        await world.admin.click(t.common.previous);
        world.stageSlide = previous;
        await world.admin.waitFor(slideText(previous));
      }
      await world.student.waitFor(slideText(world.stageSlide));
    });
  });
}
