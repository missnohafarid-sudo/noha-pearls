import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SLIDE_KIND_NAMES } from '../src/domain/slideKinds';
import { t } from '../src/i18n';
import { slideUi } from '../src/ui/slides/slideUi';
import { DESKTOP, Device as Tab } from './device';
import { SAMPLE } from './sample';
import { build, start, STARTUP_MS, stopEverything, type Server } from './serverProcess';
import { openSignIn, signInAsAdmin, launchBrowser } from './world';

/**
 * A first-time teacher on the real local server with an EMPTY school, as on the live site: the editor saves lessons that are not
 * finished (no slides yet, a blank new slide, a field half typed), and the hub must keep them. The browser-only walkthrough has no hub.
 */

const stateDir = mkdtempSync(join(tmpdir(), 'noha-pearls-first-run-'));
const FOLDER = 'First folder';
const TITLE = 'Typed slide title';
const LESSON_TITLE = 'Typed lesson title';
const SLIDE_ROWS = '.slide-row';

describe('a first-time teacher on an empty school', () => {
  let server: Server;
  let browser: Browser;
  let teacher: Tab;
  const errors: string[] = [];

  const open = (hash: string): Promise<unknown> => teacher.page.goto(`${server.origin}/${hash}`, { waitUntil: 'networkidle0' });
  const expectNoFailure = async (): Promise<void> => {
    expect(await teacher.has(t.roster.errors.unknown)).toBe(false);
    expect(await teacher.has(t.common.crashed)).toBe(false);
  };
  /** Gives the page time to show a refusal that arrives over the socket. */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1000));
  const rows = (): Promise<number> => teacher.count(SLIDE_ROWS);
  const waitForRows = (wanted: number): Promise<void> => teacher.until(`${wanted} slide rows`, async () => (await rows()) === wanted);

  /** Empties the field with this label completely, then types the text into it. */
  async function retypeField(label: string, text: string): Promise<void> {
    await teacher.until(`the field "${label}"`, () =>
      teacher.page.evaluate((wanted) => {
        const field = [...document.querySelectorAll<HTMLLabelElement>('label.field')].find((l) => l.querySelector('.field__label')?.textContent === wanted)?.querySelector('input');
        field?.focus();
        field?.select();
        return field !== undefined && field !== null;
      }, label),
    );
    await teacher.page.keyboard.press('Backspace');
    await settle();
    await teacher.page.keyboard.type(text);
    await settle();
  }

  beforeAll(async () => {
    build();
    server = await start(stateDir, { withSecrets: true, withSampleSchool: false });
    browser = await launchBrowser();
    teacher = await Tab.open(browser, 'teacher', server.origin, DESKTOP, errors);
  }, STARTUP_MS * 3);

  afterAll(async () => {
    await browser?.close();
    await stopEverything();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('signs in and sees the sample lesson', async () => {
    await teacher.waitFor(SAMPLE.title);
    await openSignIn(teacher);
    await signInAsAdmin(teacher);
    await teacher.waitFor(SAMPLE.title);
    await expectNoFailure();
  });

  it('makes a folder and a new lesson in it, which has no slides', async () => {
    await teacher.click(t.library.newFolder);
    await teacher.until('the folder name field', () => teacher.exists('.folder-tile--new input'));
    await teacher.page.keyboard.type(FOLDER);
    await teacher.page.keyboard.press('Enter');
    await teacher.until('the folder tile', async () => (await teacher.texts('.folder-tile__name')).includes(FOLDER));
    await teacher.click(FOLDER, '.folder-tile');
    await teacher.until('the folder opened', () => teacher.has(t.library.newFolder).then((shown) => shown && teacher.page.url().includes('folder')));
    await teacher.click(t.home.panel.newLesson);
    await teacher.waitFor(t.lesson.emptyLesson);
    await teacher.waitFor(t.session.startForm.noClasses);
    await expectNoFailure();
  });

  it('adds one slide of each kind', async () => {
    for (const [i, kind] of SLIDE_KIND_NAMES.entries()) {
      await teacher.click(t.lesson.slides.add(slideUi(kind).label), '.shell__panel');
      await settle();
      await expectNoFailure();
      await teacher.until(`slide row ${i + 1}`, async () => (await rows()) === i + 1, 3000);
    }
    await waitForRows(SLIDE_KIND_NAMES.length);
  });

  it('keeps typing, including an emptied lesson title', async () => {
    await retypeField(t.slides.field.title, TITLE);
    await expectNoFailure();
    await retypeField(t.lesson.field.title, LESSON_TITLE);
    await expectNoFailure();
  });

  it('still has the slides and titles after a reload', async () => {
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await waitForRows(SLIDE_KIND_NAMES.length);
    await teacher.waitFor(TITLE);
    expect(await teacher.page.$$eval('label.field input', (inputs, wanted) => inputs.some((input) => (input as HTMLInputElement).value === wanted), LESSON_TITLE)).toBe(true);
    await expectNoFailure();
  });

  it('adds a slide to the sample lesson, and it stays after a reload', async () => {
    await open('#/');
    await teacher.click(SAMPLE.title);
    await teacher.until('the slide rows', async () => (await rows()) > 0);
    const before = await rows();
    await teacher.click(t.lesson.slides.add(slideUi(SLIDE_KIND_NAMES[0]).label), '.shell__panel');
    await waitForRows(before + 1);
    await settle();
    await expectNoFailure();
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await waitForRows(before + 1);
  });

  it('adds a teacher, then a class with a group and a student', async () => {
    await open('#/');
    await teacher.click(t.session.teachers.add);
    await teacher.waitFor(t.session.teachers.defaultName);
    await open('#/roster');
    await teacher.click(t.roster.newClass);
    await teacher.click(t.roster.addGroup);
    await teacher.waitFor(t.roster.defaultGroupName);
    await teacher.click(t.roster.addStudent);
    await teacher.waitFor(t.roster.defaultStudentName);
    await expectNoFailure();
  });

  it('starts a class from a lesson page', async () => {
    await open('#/');
    await teacher.click(SAMPLE.title);
    await teacher.click(t.session.start);
    await teacher.waitFor(t.session.pacingTitle);
    await expectNoFailure();
  });

  it('raised no page error', () => {
    expect(errors).toEqual([]);
  });
});
