import type { HTTPRequest } from 'puppeteer';
import type { Lesson } from '../src/domain/models';
import { LESSON_FORMAT, LESSON_FORMAT_VERSION } from '../src/domain/lessonFormat';
import { t } from '../src/i18n';
import type { Device } from './device';
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

/** The file the editor's export button saves, read as the browser receives it: the interface's own markdown file, not the domain's bare JSON. */
export async function exportedFileOnPage(world: World, lessonId: string): Promise<string> {
  await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/1`);
  await world.admin.page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    const kept = window as unknown as { __savedFile?: Promise<string> };
    URL.createObjectURL = (source: Blob | MediaSource) => {
      if (source instanceof Blob) kept.__savedFile = source.text();
      return original(source);
    };
  });
  await world.admin.click(t.lesson.export, PANEL);
  await world.admin.until('the saved file', () => world.admin.page.evaluate(() => (window as unknown as { __savedFile?: unknown }).__savedFile !== undefined));
  return world.admin.page.evaluate(() => (window as unknown as { __savedFile: Promise<string> }).__savedFile);
}

export async function deleteLessonOnPage(world: World, lessonId: string): Promise<void> {
  await world.admin.goto(`#/lesson/${encodeURIComponent(lessonId)}/1`);
  await world.admin.click(t.lesson.delete, PANEL);
  await world.admin.click(t.common.confirm, PANEL);
  await world.admin.until('the lesson gone', async () => !(await storedRecords<Lesson>(world.admin, 'lessons')).some((lesson) => lesson.id === lessonId));
}

export const PICTURE_HOST = 'pictures.test';
const PICTURE_LIST = `${PANEL} fieldset.field`;

const PICTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#888888"/></svg>`;

/** The walkthrough has no network: the made-up picture host answers every address with a small drawing. */
export function answerPictureRequest(request: HTTPRequest): void {
  if (new URL(request.url()).hostname === PICTURE_HOST) void request.respond({ status: 200, contentType: 'image/svg+xml', body: PICTURE });
  else void request.continue();
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  loaded: boolean;
}

/** Where each element matching the selector is on this device's page, and whether it is a picture that loaded. */
export const boxesOf = (device: Device, selector: string): Promise<Box[]> =>
  device.page.$$eval(selector, (elements) =>
    elements.map((element) => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { left, right, top, bottom, loaded: (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0 };
    }),
  );

/** Adds a row to the editor's picture links and types the address into the row at `position`. */
export async function addPictureLink(world: World, link: string, position: number): Promise<void> {
  await world.admin.click(t.common.add, PICTURE_LIST);
  await typeIntoField(world, t.slides.field.images, link, 'input', position);
}
