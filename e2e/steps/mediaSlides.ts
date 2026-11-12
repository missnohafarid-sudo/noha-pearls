import type { HTTPRequest } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportLesson, importLesson, LESSON_FORMAT, LESSON_FORMAT_VERSION } from '../../src/domain/lessonFormat';
import type { Lesson, MediaSlide } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { dropDownState, dropDownValue, pickOption, pressInDropDown } from '../actions';
import { storedRecords, type World } from '../world';

const LESSON_TITLE = 'Media lesson imported by the walkthrough';
const COPY_TITLE = 'Media lesson copy';
const NO_LINK_TITLE = 'Media lesson without a link';
const MEDIA_HOST = 'media.test';
const PHOTO = `https://${MEDIA_HOST}/photo.png`;
const PHOTO_WITHOUT_ENDING = `https://${MEDIA_HOST}/photo-without-ending`;
const DEAD_PHOTO = `https://${MEDIA_HOST}/dead.png`;
const DRIVE_LINK = 'https://drive.google.com/file/d/FILE_ID_1/view?usp=drive_link';
const DRIVE_PREVIEW = 'https://drive.google.com/file/d/FILE_ID_1/preview';
const SLIDE_TITLE = 'Media slide';
const BODY_TEXT = 'Text under the media';
const PANEL = '.shell__panel';
const DIALOG_TEXT = 'dialog[open] textarea';
const WARNING_MARK = `.slide-row [role=img][aria-label="${t.lesson.slides.problem}"]`;

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const lessonFile = (slides: object[], title = LESSON_TITLE) => JSON.stringify({ format: LESSON_FORMAT, version: LESSON_FORMAT_VERSION, title, slides });
const MEDIA_FILE_SLIDE = { kind: 'media', title: 'Clip', tag: 'Show', url: 'https://media.test/clip.mp4', media: 'video', body: '- one\ntwo' };

/** The walkthrough has no network: the made-up media host answers with a picture, a dead link answers 404, and the Drive address with an empty page. */
function answerMediaRequest(request: HTTPRequest): void {
  const { hostname, pathname } = new URL(request.url());
  if (hostname === MEDIA_HOST && pathname !== '/dead.png') void request.respond({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
  else if (hostname === MEDIA_HOST) void request.respond({ status: 404, body: '' });
  else if (hostname === 'drive.google.com') void request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>blank</title>' });
  else void request.continue();
}

async function storedMediaSlide(world: World, lessonId: string): Promise<MediaSlide> {
  const lessons = await storedRecords<Lesson>(world.admin, 'lessons');
  const slide = lessons.find((lesson) => lesson.id === lessonId)?.slides.find((s): s is MediaSlide => s.kind === 'media');
  if (!slide) throw new Error('The media slide is not in browser storage.');
  return slide;
}

/** Types into the text field of the side panel with this label, the way typing does. */
async function typeIntoField(world: World, label: string, value: string, tag: 'input' | 'textarea' = 'input'): Promise<void> {
  const attempt = () =>
    world.admin.page.evaluate(
      (wanted, text, selector, panel) => {
        const field = [...document.querySelectorAll<HTMLElement>(`${panel} label.field`)].find((candidate) => candidate.querySelector('.field__label')?.textContent?.trim() === wanted);
        const control = field?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
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
    );
  await world.admin.until(`the field "${label}" in the side panel`, attempt);
}

const imageLoaded = (world: World) =>
  world.admin.page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>('.slide img.media__image');
    return image !== null && image.complete && image.naturalWidth > 0;
  });

async function pasteFile(world: World, text: string): Promise<void> {
  await world.admin.goto('#/');
  await world.admin.click(t.home.panel.importLesson);
  await world.admin.until('the import dialog', () => world.admin.exists(DIALOG_TEXT));
  await world.admin.paste(DIALOG_TEXT, text);
  await world.admin.click(t.lesson.import.importButton, 'dialog[open]');
}

const lessonIdOnPage = (world: World) => decodeURIComponent(world.admin.page.url().split('#/lesson/')[1].split('/')[0]);

/** A slide that shows something from a pasted link: the picture, the notices that tell the teacher what is wrong, the frame, and the lesson file. */
export function mediaSlidesSteps(world: World): void {
  describe('media slides', () => {
    let lessonId = '';

    beforeAll(async () => {
      await world.admin.page.setRequestInterception(true);
      world.admin.page.on('request', answerMediaRequest);
    });

    afterAll(async () => {
      world.admin.page.off('request', answerMediaRequest);
      await world.admin.page.setRequestInterception(false);
    });

    it('the teacher imports a small lesson and adds a media slide to it', async () => {
      await pasteFile(world, lessonFile([{ kind: 'content', title: 'Opening', body: 'x' }]));
      await world.admin.until('the lesson editor address', async () => world.admin.page.url().includes('#/lesson/'));
      lessonId = lessonIdOnPage(world);
      await world.admin.click(t.lesson.slides.add(t.slides.kind.media), PANEL);
      await world.admin.waitFor(t.slides.media.problem['no-link']);
      await world.admin.until('the warning mark in the slide list', () => world.admin.exists(WARNING_MARK));
    });

    it('a link ending in .png with the type left on automatic shows the picture, and the warning mark goes', async () => {
      await typeIntoField(world, t.slides.field.title, SLIDE_TITLE);
      await typeIntoField(world, t.slides.field.url, PHOTO);
      await world.admin.until('the picture on the slide', () => imageLoaded(world));
      await world.admin.until('no warning mark', async () => !(await world.admin.exists(WARNING_MARK)));
      expect(await world.admin.exists('.slide .notice')).toBe(false);
    });

    it('a link with no known ending on automatic shows the notice and the warning mark', async () => {
      await typeIntoField(world, t.slides.field.url, PHOTO_WITHOUT_ENDING);
      await world.admin.waitFor(t.slides.media.problem['unknown-type']);
      await world.admin.until('the warning mark in the slide list', () => world.admin.exists(WARNING_MARK));
      expect(await world.admin.exists('.slide img')).toBe(false);
    });

    it('choosing the type from our drop-down shows the media and clears the mark', async () => {
      await pickOption(world.admin, { fieldLabel: t.slides.field.media }, t.slides.mediaType.image);
      await world.admin.until('the picture on the slide', () => imageLoaded(world));
      await world.admin.until('no warning mark', async () => !(await world.admin.exists(WARNING_MARK)));
      expect((await storedMediaSlide(world, lessonId)).media).toBe('image');
    });

    it('the type drop-down answers the keyboard: Home opens on the first, PageDown goes to the last, Alt+ArrowUp chooses', async () => {
      const drop = { fieldLabel: t.slides.field.media };
      await pressInDropDown(world.admin, drop, 'Home');
      expect(await dropDownState(world.admin, drop)).toMatchObject({ open: true, active: t.slides.mediaType.auto });
      await pressInDropDown(world.admin, drop, 'PageDown');
      expect((await dropDownState(world.admin, drop)).active).toBe(t.slides.mediaType.embed);
      await pressInDropDown(world.admin, drop, 'Alt+ArrowUp');
      expect((await dropDownState(world.admin, drop)).open).toBe(false);
      expect(await dropDownValue(world.admin, drop)).toBe(t.slides.mediaType.embed);
      expect((await storedMediaSlide(world, lessonId)).media).toBe('embed');
    });

    it('pressing the label text of the open type drop-down closes it once and does not open it again', async () => {
      const drop = { fieldLabel: t.slides.field.media };
      await pressInDropDown(world.admin, drop, 'End');
      expect((await dropDownState(world.admin, drop)).open).toBe(true);
      const point = await world.admin.page.evaluate((wanted, panel) => {
        const field = [...document.querySelectorAll<HTMLElement>(`${panel} label.field`)].find((candidate) => candidate.querySelector('.field__label')?.textContent?.trim() === wanted);
        const box = field?.querySelector('.field__label')?.getBoundingClientRect();
        return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
      }, t.slides.field.media, PANEL);
      if (!point) throw new Error('The label of the type drop-down is not in the side panel.');
      await world.admin.page.mouse.click(point.x, point.y);
      // A pointer left over an option would move the highlight by itself.
      await world.admin.page.mouse.move(0, 0);
      await world.admin.holds('the list closed after the label press', async () => !(await dropDownState(world.admin, drop)).open);
      await pressInDropDown(world.admin, drop, 'Home', 'ArrowDown', 'ArrowDown', 'Enter');
      expect(await dropDownValue(world.admin, drop)).toBe(t.slides.mediaType.image);
      expect((await storedMediaSlide(world, lessonId)).media).toBe('image');
    });

    it('a link that is not https is told apart from a missing one', async () => {
      await typeIntoField(world, t.slides.field.url, 'http://media.test/photo.png');
      await world.admin.waitFor(t.slides.media.problem['not-https']);
      expect(await world.admin.exists('.slide .media__open')).toBe(false);
    });

    it('a picture that fails to load is replaced by the notice for the teacher', async () => {
      await typeIntoField(world, t.slides.field.url, DEAD_PHOTO);
      await world.admin.waitFor(t.slides.media.loadFailedTeacher);
      expect(await world.admin.exists('.slide img')).toBe(false);
      expect(await world.admin.exists('.slide .media__open')).toBe(true);
    });

    it('a Drive-shaped link is framed in the viewer with the measured sandbox, and the text shows under it', async () => {
      await typeIntoField(world, t.slides.field.url, DRIVE_LINK);
      await pickOption(world.admin, { fieldLabel: t.slides.field.media }, t.slides.mediaType.auto);
      await typeIntoField(world, t.slides.field.body, `- ${BODY_TEXT}`, 'textarea');
      await world.admin.until('the frame', () => world.admin.exists('.slide iframe'));
      const frame = await world.admin.page.$eval('.slide iframe', (element) => ({
        src: element.getAttribute('src'),
        sandbox: element.getAttribute('sandbox'),
        allow: element.getAttribute('allow'),
        referrerPolicy: element.getAttribute('referrerpolicy'),
        loading: element.getAttribute('loading'),
        title: element.getAttribute('title'),
      }));
      expect(frame).toEqual({ src: DRIVE_PREVIEW, sandbox: 'allow-scripts allow-same-origin', allow: 'fullscreen', referrerPolicy: 'no-referrer', loading: 'lazy', title: SLIDE_TITLE });
      await world.admin.waitFor(BODY_TEXT);
      expect(await world.admin.exists(WARNING_MARK)).toBe(false);
    });

    it('the link to open it in a new window carries the pasted address', async () => {
      const link = await world.admin.page.$eval('.slide .media__open', (element) => ({ text: element.textContent, href: element.getAttribute('href'), target: element.getAttribute('target'), rel: element.getAttribute('rel') }));
      expect(link).toEqual({ text: t.slides.media.open, href: DRIVE_LINK, target: '_blank', rel: 'noopener noreferrer' });
    });

    it('a lesson file with a media slide imports and exports back unchanged', async () => {
      const original = importLesson(lessonFile([MEDIA_FILE_SLIDE], COPY_TITLE));
      if (!original.ok) throw new Error('The media test file was refused by the importer.');
      await pasteFile(world, exportLesson(original.lesson));
      await world.admin.waitFor(COPY_TITLE);
      await world.admin.until('the lesson editor address', async () => lessonIdOnPage(world) !== lessonId);
      const copyId = lessonIdOnPage(world);
      const stored = (await storedRecords<Lesson>(world.admin, 'lessons')).find((lesson) => lesson.id === copyId);
      if (!stored) throw new Error('The imported media lesson is not in browser storage.');
      const withoutIds = (lesson: Lesson) => lesson.slides.map(({ id: _id, ...rest }) => rest);
      expect(withoutIds(stored)).toEqual(withoutIds(original.lesson));
      expect(JSON.parse(exportLesson(stored)).slides).toEqual([MEDIA_FILE_SLIDE]);
    });

    it('a file whose link is not https is refused with the new message', async () => {
      const refused = importLesson(lessonFile([{ ...MEDIA_FILE_SLIDE, url: 'http://media.test/clip.mp4' }]));
      if (refused.ok) throw new Error('A media slide with an http link was accepted.');
      await pasteFile(world, lessonFile([{ ...MEDIA_FILE_SLIDE, url: 'http://media.test/clip.mp4' }]));
      for (const issue of refused.issues) await world.admin.waitFor(t.lessonFile.describeIssue(issue));
      expect(refused.issues.map((issue) => issue.code)).toEqual(['bad-url']);
    });

    it('a file whose media slide has no link imports, and the slide carries the warning mark', async () => {
      await world.admin.paste(DIALOG_TEXT, lessonFile([{ ...MEDIA_FILE_SLIDE, url: '' }], NO_LINK_TITLE));
      await world.admin.click(t.lesson.import.importButton, 'dialog[open]');
      await world.admin.waitFor(NO_LINK_TITLE);
      await world.admin.until('the warning mark in the slide list', () => world.admin.exists(WARNING_MARK));
      await world.admin.waitFor(t.slides.media.problem['no-link']);
    });

    it('the walkthrough removes its three lessons so that later steps meet the lessons they expect', async () => {
      for (const title of [LESSON_TITLE, COPY_TITLE, NO_LINK_TITLE]) {
        const stored = (await storedRecords<Lesson>(world.admin, 'lessons')).find((lesson) => lesson.title === title);
        if (!stored) throw new Error(`The lesson "${title}" is not in browser storage.`);
        await world.admin.goto(`#/lesson/${encodeURIComponent(stored.id)}/1`);
        await world.admin.waitFor(title);
        await world.admin.click(t.lesson.delete, PANEL);
        await world.admin.click(t.common.confirm, PANEL);
        await world.admin.until(`${title} gone`, async () => !(await storedRecords<Lesson>(world.admin, 'lessons')).some((lesson) => lesson.title === title));
      }
    });
  });
}
