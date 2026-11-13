import type { Lesson } from '../src/domain/models';
import { LESSON_FORMAT, LESSON_FORMAT_VERSION } from '../src/domain/lessonFormat';
import { t } from '../src/i18n';
import { storedRecords, type World } from './world';

/** What the lessons lanes share: a lesson file, importing one through the dialog, finding it in storage, filling a side-panel field and removing the lesson again. */

export const PANEL = '.shell__panel';
export const DIALOG_TEXT = 'dialog[open] textarea';

export const lessonFileText = (slides: object[], title: string) => JSON.stringify({ format: LESSON_FORMAT, version: LESSON_FORMAT_VERSION, title, slides });

export const lessonIdOnPage = (world: World) => decodeURIComponent(world.admin.page.url().split('#/lesson/')[1].split('/')[0]);

/** Opens the import dialog from the library's side panel (the lesson lands in the open folder) and imports the pasted text. */
export async function pasteLessonFile(world: World, text: string): Promise<void> {
  await world.admin.goto('#/');
  await world.admin.click(t.home.panel.importLesson);
  await world.admin.until('the import dialog', () => world.admin.exists(DIALOG_TEXT));
  await world.admin.paste(DIALOG_TEXT, text);
  await world.admin.click(t.lesson.import.importButton, 'dialog[open]');
}

export async function importLessonFile(world: World, text: string, title: string): Promise<string> {
  await pasteLessonFile(world, text);
  await world.admin.waitFor(title);
  await world.admin.until('the lesson editor address', async () => world.admin.page.url().includes('#/lesson/'));
  return lessonIdOnPage(world);
}

export async function storedLessonById(world: World, lessonId: string): Promise<Lesson> {
  const found = (await storedRecords<Lesson>(world.admin, 'lessons')).find((lesson) => lesson.id === lessonId);
  if (!found) throw new Error('The lesson is not in browser storage.');
  return found;
}

/** Types into the side-panel field with this label the way typing does; `nth` picks the input among a list field's inputs. */
export async function typeIntoField(world: World, label: string, value: string, tag: 'input' | 'textarea' = 'input', nth = 0): Promise<void> {
  const attempt = () =>
    world.admin.page.evaluate(
      (wanted, text, selector, panel, at) => {
        const field = [...document.querySelectorAll<HTMLElement>(`${panel} .field`)].find((candidate) => candidate.querySelector('.field__label')?.textContent?.trim() === wanted);
        const control = field?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector)[at];
        if (!control) return false;
        const prototype = selector === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, text);
        control.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      },
      label,
      value,
      tag,
      PANEL,
      nth,
    );
  await world.admin.until(`the field "${label}" in the side panel`, attempt);
}

export async function deleteLessonOnPage(world: World, lessonId: string): Promise<void> {
  await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/1`);
  await world.admin.click(t.lesson.delete, PANEL);
  await world.admin.click(t.common.confirm, PANEL);
  await world.admin.until('the lesson gone', async () => !(await storedRecords<Lesson>(world.admin, 'lessons')).some((lesson) => lesson.id === lessonId));
}
