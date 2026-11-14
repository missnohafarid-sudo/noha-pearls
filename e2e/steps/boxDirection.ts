import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContentSlide } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { PANEL, deleteLessonOnPage, importLessonFile, lessonFileText, storedLessonById } from '../lessonLane';
import type { World } from '../world';
import { focusField } from './inlineHidden';

const TITLE = 'Lesson for box direction';
const OPEN = '⁦';
const CLOSE = '⁩';
const WORD = 'الشرح';
const TAG = `${WORD} 25°C`;
const LETTER = 'ب';
const EQUATION_LINE = 'السرعة v = 5 m/s';
const NEXT_LINE = 'ثم نكمل الحل';
const ENGLISH_TITLE = 'A plain English title';
const SLIDE = { kind: 'content', title: 'Slide for box direction', tag: '', body: '' };

const boxState = (world: World, label: string, tag: 'input' | 'textarea') =>
  world.admin.page.evaluate(
    (wanted, selector, panel) => {
      const field = [...document.querySelectorAll<HTMLElement>(`${panel} .field`)].find((candidate) => candidate.querySelector('.field__label')?.textContent?.trim() === wanted);
      const control = field?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      return control ? { value: control.value, caret: control.selectionStart, focused: document.activeElement === control } : null;
    },
    label,
    tag,
    PANEL,
  );
const stored = async (world: World, lessonId: string) => (await storedLessonById(world, lessonId)).slides[0] as ContentSlide;
const typeText = (world: World, text: string) => world.admin.page.keyboard.type(text);

/** Equations and English pieces in the editor's text boxes read in their own order, and what is saved is exactly what was typed. */
export function boxDirectionSteps(world: World): void {
  describe('equations inside the editor text boxes', () => {
    let lessonId = '';

    beforeAll(async () => {
      lessonId = await importLessonFile(world, lessonFileText([SLIDE], TITLE), TITLE);
    });

    afterAll(async () => {
      await deleteLessonOnPage(world, lessonId);
    });

    it('typing an Arabic word and an equation into the tag box stores exactly that, fences the equation in the box, and keeps the caret at the end', async () => {
      await focusField(world, t.slides.field.tag, 'input');
      await typeText(world, TAG);
      await world.admin.until('the tag stored', async () => (await stored(world, lessonId)).tag === TAG);
      await world.admin.until('the tag on the slide', async () => (await world.admin.texts('.slide .chip')).join('').includes(TAG));
      const box = await boxState(world, t.slides.field.tag, 'input');
      expect(box?.value).toBe(`${WORD} ${OPEN}25°C${CLOSE}`);
      expect(box?.caret).toBe(box?.value.length);
    });

    it('typing one Arabic letter into the middle of the word puts it there and leaves the caret right after it', async () => {
      await focusField(world, t.slides.field.tag, 'input', [2, 2]);
      await typeText(world, LETTER);
      const expected = `${TAG.slice(0, 2)}${LETTER}${TAG.slice(2)}`;
      await world.admin.until('the letter stored in the middle', async () => (await stored(world, lessonId)).tag === expected);
      const box = await boxState(world, t.slides.field.tag, 'input');
      expect(box?.focused).toBe(true);
      expect(box?.caret).toBe(3);
    });

    it('a line with an equation, Enter and an Arabic line typed into the body box are stored exactly as typed', async () => {
      await focusField(world, t.slides.field.body, 'textarea');
      await typeText(world, EQUATION_LINE);
      await world.admin.page.keyboard.press('Enter');
      await typeText(world, NEXT_LINE);
      const expected = `${EQUATION_LINE}\n${NEXT_LINE}`;
      await world.admin.until('the body stored', async () => (await stored(world, lessonId)).body === expected);
      const box = await boxState(world, t.slides.field.body, 'textarea');
      expect(box?.value).toContain(`${OPEN}v = 5 m/s${CLOSE}`);
      expect(box?.caret).toBe(box?.value.length);
    });

    it('an all-English title typed into the title box leaves the box free of the fence marks', async () => {
      const current = await boxState(world, t.slides.field.title, 'input');
      await focusField(world, t.slides.field.title, 'input', [0, current?.value.length ?? 0]);
      await typeText(world, ENGLISH_TITLE);
      await world.admin.until('the title stored', async () => (await stored(world, lessonId)).title === ENGLISH_TITLE);
      const box = await boxState(world, t.slides.field.title, 'input');
      expect(box?.value).toBe(ENGLISH_TITLE);
      expect(box?.value).not.toContain(OPEN);
      expect(box?.value).not.toContain(CLOSE);
    });
  });
}
