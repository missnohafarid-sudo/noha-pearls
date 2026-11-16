import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SLIDE_KIND_NAMES } from '../src/domain/slideKinds';
import { t } from '../src/i18n';
import { slideUi } from '../src/ui/slides/slideUi';
import { admitWaitingDevice, sessionCodeIn } from './actions';
import { DESKTOP, Device as Tab, PHONE } from './device';
import { SAMPLE, SLIDE, slideText } from './sample';
import { build, start, STARTUP_MS, stopEverything, type Server } from './serverProcess';
import { dragName, namesUnder } from './steps/memberDrag';
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
const CODE_FIELD_WAIT_MS = 30_000;
const HIDDEN_TEXT = 'Typed hidden line';

describe('a first-time teacher on an empty school', () => {
  let server: Server;
  let browser: Browser;
  let deviceBrowser: Browser | undefined;
  let phone: Tab;
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

  const pearlButton = '.shell__bar .theme-picker__button';
  const pearlList = '.shell__bar .theme-picker__list';
  const look = (): Promise<string | undefined> => teacher.page.evaluate(() => document.documentElement.dataset.theme);
  const choosePearl = async (name: string): Promise<void> => {
    await teacher.until('the pearl button ready', () => teacher.exists(`${pearlButton}:not(:disabled)`));
    await teacher.page.click(pearlButton);
    await teacher.until('the list of looks', () => teacher.page.$eval(pearlList, (list) => !list.hasAttribute('hidden')));
    await teacher.click(name, pearlList);
    await settle();
    await expectNoFailure();
  };

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


  /** Makes a folder at the top level, opens it and fills it with new lessons; returns its address. */
  async function folderWithLessons(name: string, lessonCount: number): Promise<string> {
    await open('#/');
    await teacher.click(t.library.newFolder);
    await teacher.until('the folder name field', () => teacher.exists('.folder-tile--new input'));
    await teacher.page.keyboard.type(name);
    await teacher.page.keyboard.press('Enter');
    await teacher.until('the folder tile', async () => (await teacher.texts('.folder-tile__name')).includes(name));
    await teacher.click(name, '.library__folders');
    await teacher.until('the folder opened', async () => teacher.page.url().includes('folder') && (await teacher.has(t.library.newFolder)));
    const address = teacher.page.url();
    for (let made = 0; made < lessonCount; made += 1) {
      await pressNewLesson();
      await teacher.until('the lesson editor', async () => teacher.page.url().includes('#/lesson/'));
      await teacher.page.goto(address, { waitUntil: 'networkidle0' });
      await teacher.until(`${made + 1} lessons shown`, async () => (await lessonTiles()) === made + 1);
    }
    return address;
  }
  /** The panel's own button: a lesson card of the same title would match the words too. */
  const pressNewLesson = (): Promise<void> =>
    teacher.until('the new lesson button', () =>
      teacher.page.evaluate((label) => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('button.btn--primary')].find((candidate) => candidate.innerText.includes(label));
        button?.click();
        return button !== undefined;
      }, t.home.panel.newLesson),
    );
  const lessonTiles = (): Promise<number> => teacher.count('.lesson-tile');
  const unpublishedChips = (): Promise<number> => teacher.count('.lesson-tile .chip--bad');
  const newLessonTitles = async (): Promise<number> => (await teacher.texts('.lesson-tile .card__title')).filter((title) => title === t.home.panel.newLessonTitle).length;
  const selectAll = (): Promise<void> => teacher.page.click('.selection-bar .checkbox');
  const pressLabelled = (label: string): Promise<void> =>
    teacher.until(`the button "${label}"`, () =>
      teacher.page.evaluate((wanted) => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.getAttribute('aria-label') === wanted);
        button?.click();
        return button !== undefined;
      }, label),
    );

  beforeAll(async () => {
    build();
    server = await start(stateDir, { withSecrets: true, withSampleSchool: false });
    browser = await launchBrowser();
    teacher = await Tab.open(browser, 'teacher', server.origin, DESKTOP, errors);
  }, STARTUP_MS * 3);

  afterAll(async () => {
    await browser?.close();
    await deviceBrowser?.close();
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

  it('shows at the foot of the home page a dot beside the note, never over it, whose tip says where the hub runs', async () => {
    await teacher.until('the dot that says where the hub runs', () => teacher.exists('.data-note__dot'));
    const apart = await teacher.page.evaluate(() => {
      const lane = document.querySelector('.data-note__lane')?.getBoundingClientRect();
      const dot = document.querySelector('.data-note__dot')?.getBoundingClientRect();
      return lane !== undefined && dot !== undefined && dot.right <= lane.left;
    });
    expect(apart, 'the dot is not at the end of the note, clear of it').toBe(true);
    await teacher.page.hover('.data-note .tip');
    await teacher.until('the tip naming the hub’s place', () =>
      teacher.page.evaluate((name) => (document.querySelector('[role="tooltip"]')?.textContent ?? '').includes(name), t.home.hubPlaceName),
    );
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

  it('chooses a pearl for the look of the site, which the hub keeps through a reload, then puts the usual look back', async () => {
    await choosePearl(t.common.pearlShade.purple);
    await teacher.until('the purple look', async () => (await look()) === 'purple');
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await teacher.until('the purple look after a reload', async () => (await look()) === 'purple');
    await choosePearl(t.common.pearlShade.white);
    await teacher.until('the usual look', async () => (await look()) === 'white');
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await teacher.until('the usual look after a reload', async () => (await look()) === 'white');
  });

  it('sends a tagline typed and a look picked straight after together, and both are there after a reload', async () => {
    const taglineInput = (): Promise<string | undefined> =>
      teacher.page.evaluate((wanted) => {
        const label = [...document.querySelectorAll<HTMLLabelElement>('label.field')].find((l) => l.querySelector('.field__label')?.textContent === wanted);
        return label?.querySelector('input')?.value;
      }, t.home.siteField.tagline);
    const NEW_TAGLINE = 'عبارة جديدة';
    await open('#/');
    await teacher.until('the tagline field', async () => (await taglineInput()) !== undefined);
    const usualTagline = (await taglineInput()) ?? '';
    await teacher.page.evaluate((wanted) => {
      const label = [...document.querySelectorAll<HTMLLabelElement>('label.field')].find((l) => l.querySelector('.field__label')?.textContent === wanted);
      const field = label?.querySelector('input');
      field?.focus();
      field?.select();
    }, t.home.siteField.tagline);
    await teacher.page.keyboard.press('Backspace');
    await teacher.page.keyboard.type(NEW_TAGLINE);
    await choosePearl(t.common.pearlShade.purple);
    await teacher.until('the purple look', async () => (await look()) === 'purple');
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await teacher.until('the new tagline after a reload', async () => (await taglineInput()) === NEW_TAGLINE);
    await teacher.until('the purple look after a reload', async () => (await look()) === 'purple');
    await expectNoFailure();
    await retypeField(t.home.siteField.tagline, usualTagline);
    await choosePearl(t.common.pearlShade.white);
    await teacher.until('the usual look', async () => (await look()) === 'white');
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await teacher.until('the usual tagline after a reload', async () => (await taglineInput()) === usualTagline);
    await teacher.until('the usual look after a reload', async () => (await look()) === 'white');
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

  it('a shared group device gives its student an answer by moving her name onto an option, and the hub accepts it and shows it back', async () => {
    deviceBrowser = await launchBrowser();
    phone = await Tab.open(deviceBrowser, 'shared device', server.origin, PHONE, errors);
    await phone.until('the code field', () => phone.exists('.join-code input'), CODE_FIELD_WAIT_MS);
    await phone.fill('.join-code input', sessionCodeIn(teacher));
    await phone.page.keyboard.press('Enter');
    await phone.click(t.roster.defaultGroupName);
    await phone.click(t.join.sharedDevice);
    await phone.waitFor(t.join.admissionTitle);
    await teacher.until('the device in the waiting list', async () => (await teacher.has(t.session.admission.admit)));
    await admitWaitingDevice(teacher);
    await phone.waitFor(slideText(0));
    for (let pressed = 0; pressed <= SLIDE.poll + 1 && !(await phone.has(slideText(SLIDE.poll))); pressed += 1) {
      await teacher.click(t.common.next);
      await settle();
    }
    await phone.waitFor(slideText(SLIDE.poll));
    await phone.waitFor(t.join.answersPerStudentOnGroupDevice);
    await phone.until('her name above the options', async () => (await phone.texts('.member-row .name-chip')).some((name) => name.includes(t.roster.defaultStudentName)));
    expect(await namesUnder(phone, 1)).toEqual([]);
    await dragName(phone, t.roster.defaultStudentName, 1, 'mouse');
    await phone.until('her name under the option she was given', async () => (await namesUnder(phone, 1)).some((name) => name.includes(t.roster.defaultStudentName)));
    await settle();
    expect(await phone.has(t.common.crashed)).toBe(false);
    await expectNoFailure();
  });

  it('opens a hidden part on the presenting screen, and the let-in phone shows it then, with no failure', async () => {
    const code = sessionCodeIn(teacher);
    const slide = SLIDE.poll + 1;
    await open('#/');
    await teacher.click(SAMPLE.title);
    await teacher.until('the lesson address', async () => /#\/lesson\/[^/]+/.test(teacher.page.url()));
    const lessonAddress = /#\/lesson\/([^/?]+)/.exec(teacher.page.url())?.[1] ?? '';
    await teacher.until('the slide rows', async () => (await rows()) > slide);
    const position = (await teacher.texts(SLIDE_ROWS)).findIndex((row) => row.includes(SAMPLE.slides[slide].title)) + 1;
    await open(`#/lesson/${lessonAddress}/${position}`);
    await teacher.waitFor(SAMPLE.slides[slide].title);
    await teacher.until('the hidden-text box', () =>
      teacher.page.evaluate(
        (wanted, value) => {
          const field = [...document.querySelectorAll<HTMLElement>('.shell__panel .field')].find((candidate) => candidate.querySelector('.field__label')?.textContent?.trim() === wanted);
          const control = field?.querySelector<HTMLTextAreaElement>('textarea');
          if (!control) return false;
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(control, value);
          control.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        },
        t.slides.field.hidden,
        HIDDEN_TEXT,
      ),
    );
    await settle();
    await open(`#/session/${code}`);
    await teacher.waitFor(t.session.pacingTitle);
    await teacher.click(t.common.next);
    await phone.waitFor(slideText(slide));
    await teacher.waitFor(t.slides.view.showHidden);
    expect(await phone.has(t.slides.view.showHidden)).toBe(false);
    expect(await phone.has(HIDDEN_TEXT)).toBe(false);
    await teacher.click(t.slides.view.showHidden, '.slide');
    await phone.waitFor(HIDDEN_TEXT);
    expect(await phone.has(t.slides.view.showHidden)).toBe(false);
    await settle();
    await expectNoFailure();
    await teacher.click(t.slides.view.hideHidden, '.slide');
    await phone.waitGone(HIDDEN_TEXT);
    await settle();
    await expectNoFailure();
  });

  it('gives a heart on the monitor, takes it back, then gives it again', async () => {
    const owner = t.roster.defaultStudentName;
    const has = (selector: string): Promise<boolean> => teacher.exists(selector);
    const heartButton = (count: number): string => `tbody tr button.btn--heart[aria-label="${t.common.heartsOf(owner, count)}"]`;
    const takeButton = `tbody tr button[aria-label="${t.common.takeHeartFrom(owner)}"]`;
    await open('#/monitor');
    await teacher.until('the student at no hearts', () => has(heartButton(0)));
    expect(await has(takeButton)).toBe(false);
    await teacher.page.click(heartButton(0));
    await teacher.until('one heart', () => has(heartButton(1)));
    await teacher.page.click(takeButton);
    await teacher.until('no heart again', () => has(heartButton(0)));
    await teacher.until('the take button gone', async () => !(await has(takeButton)));
    await teacher.page.click(heartButton(0));
    await teacher.until('the heart back', () => has(heartButton(1)));
    await settle();
    await expectNoFailure();
  });

  it('publishes the selected lessons of a folder, and they stay published after a reload', async () => {
    await folderWithLessons('Select folder', 2);
    expect(await unpublishedChips()).toBe(2);
    await selectAll();
    await teacher.click(t.library.select.publish, '.selection-bar');
    await teacher.until('no unpublished chip', async () => (await unpublishedChips()) === 0);
    await settle();
    await expectNoFailure();
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await teacher.until('both lessons shown', async () => (await lessonTiles()) === 2);
    expect(await unpublishedChips()).toBe(0);
  });

  it('moves the selected lessons to the top level through the dialog', async () => {
    await selectAll();
    await teacher.click(t.library.moveWord, '.selection-bar');
    await teacher.until('the move dialog', () => teacher.exists('dialog[open] .move-list'));
    await teacher.click(t.library.rootName, 'dialog[open]');
    await teacher.until('the folder emptied', async () => (await lessonTiles()) === 0);
    await settle();
    await expectNoFailure();
    await open('#/');
    await teacher.until('both lessons at the top level', async () => (await newLessonTitles()) === 2);
  });

  it('deletes a folder together with the lesson inside it', async () => {
    await folderWithLessons('Doomed folder', 1);
    await open('#/');
    await pressLabelled(t.library.deleteFolder('Doomed folder'));
    await teacher.until('the delete dialog', () => teacher.exists('dialog[open]'));
    await teacher.page.click('dialog[open] .checkbox');
    await teacher.waitFor(t.library.deleteDialog.loses(0, 1));
    await teacher.click(t.common.remove, 'dialog[open]');
    await teacher.until('the folder gone', async () => !(await teacher.texts('.folder-tile__name')).includes('Doomed folder'));
    await settle();
    await expectNoFailure();
    await open('#/');
    expect(await newLessonTitles()).toBe(2);
  });

  it('deletes two selected lessons', async () => {
    await teacher.page.evaluate((title) => {
      for (const tile of document.querySelectorAll<HTMLElement>('.lesson-tile')) if (tile.querySelector('.card__title')?.textContent === title) tile.querySelector<HTMLElement>('.checkbox')?.click();
    }, t.home.panel.newLessonTitle);
    await teacher.waitFor(t.library.select.count(2));
    await teacher.click(t.common.remove, '.selection-bar');
    await teacher.click(t.common.confirm, '.selection-bar');
    await teacher.until('both lessons gone', async () => (await newLessonTitles()) === 0);
    await settle();
    await expectNoFailure();
    await teacher.page.reload({ waitUntil: 'networkidle0' });
    await teacher.waitFor(SAMPLE.title);
    expect(await newLessonTitles()).toBe(0);
  });

  it('raised no page error', () => {
    expect(errors).toEqual([]);
  });
});
