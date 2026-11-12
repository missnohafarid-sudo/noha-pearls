import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { importLesson } from '../../src/domain/lessonFormat';
import type { ChoiceSlide, Lesson } from '../../src/domain/models';
import { t } from '../../src/i18n';
import { SAMPLE, SLIDE } from '../sample';
import { storedRecords, type World } from '../world';

const IMPORTED_TITLE = 'Lesson imported by the walkthrough';
const TITLE_SUFFIX = ' (edited)';
const DIALOG_TEXT = 'dialog[open] textarea';
const FILE_TEXT = 'Text read from the chosen file';

const BROKEN_FILE = {
  ...SAMPLE,
  slides: [{ kind: 'choice', title: 'x', prompt: '?', options: ['only one'], correct: 4 }, { kind: 'film' }],
};

async function paste(world: World, text: string): Promise<void> {
  await world.admin.paste(DIALOG_TEXT, text);
  await world.admin.click(t.lesson.import.importButton, 'dialog[open]');
}

async function storedLesson(world: World): Promise<Lesson> {
  const lessons = await storedRecords<Lesson>(world.admin, 'lessons');
  const found = lessons.find((lesson) => lesson.id === world.importedLessonId);
  if (!found) throw new Error('The imported lesson is not in browser storage.');
  return found;
}

/** Importing a lesson, then editing it from the side panel and walking through it. */
export function lessonEditingSteps(world: World): void {
  it('the import dialog opens', async () => {
    await world.admin.click(t.home.panel.importLesson);
    await world.admin.until('the import dialog', () => world.admin.exists(DIALOG_TEXT));
  });

  it('choosing the same file twice in the file picker delivers it both times', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'noha-pearls-file-'));
    const path = join(folder, 'chosen.txt');
    writeFileSync(path, FILE_TEXT);
    const textarea = () => world.admin.page.$eval(DIALOG_TEXT, (element) => (element as HTMLTextAreaElement).value);
    const choose = async () => {
      const button = await world.admin.page.evaluate((label) => {
        const box = [...document.querySelectorAll<HTMLElement>('dialog[open] label')].find((candidate) => candidate.innerText.trim().includes(label))?.getBoundingClientRect();
        return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
      }, t.common.chooseFile);
      if (!button) throw new Error('The file button is not in the import dialog.');
      const [chooser] = await Promise.all([world.admin.page.waitForFileChooser(), world.admin.page.mouse.click(button.x, button.y)]);
      await chooser.accept([path]);
    };
    try {
      await choose();
      await world.admin.until('the first choice in the text box', async () => (await textarea()) === FILE_TEXT);
      await world.admin.paste(DIALOG_TEXT, '');
      await choose();
      await world.admin.until('the second choice of the same file in the text box', async () => (await textarea()) === FILE_TEXT);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    await world.admin.paste(DIALOG_TEXT, '');
  });

  it('a broken file lists its problems', async () => {
    const result = importLesson(JSON.stringify(BROKEN_FILE));
    if (result.ok) throw new Error('The broken test file was accepted by the importer.');
    await paste(world, JSON.stringify(BROKEN_FILE));
    for (const issue of result.issues) await world.admin.waitFor(t.lessonFile.describeIssue(issue));
  });

  it('a valid file wrapped in chat prose opens in the editor', async () => {
    const chat = `Here is the lesson:\n\`\`\`json\n${JSON.stringify({ ...SAMPLE, title: IMPORTED_TITLE })}\n\`\`\`\nGood luck!`;
    await paste(world, chat);
    await world.admin.waitFor(IMPORTED_TITLE);
    await world.admin.until('the lesson editor address', async () => world.admin.page.url().includes('#/lesson/'));
    world.importedLessonId = decodeURIComponent(world.admin.page.url().split('#/lesson/')[1].split('/')[0]);
    await world.admin.until('the editor panel', () => world.admin.exists('.shell__panel label'));
  });

  it('editing a field in the side panel changes the slide', async () => {
    await world.admin.page.evaluate((label) => {
      const labels = [...document.querySelectorAll<HTMLLabelElement>('.shell__panel label')].filter((l) => l.innerText.trim().startsWith(label));
      const input = labels.pop()?.querySelector('input');
      if (!input) throw new Error('The slide title field is missing from the side panel.');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, t.slides.field.title);
    await world.admin.page.keyboard.type(TITLE_SUFFIX);
    await world.admin.until('the edited title on the slide', async () => (await world.admin.texts('.slide__title')).some((title) => title.includes(TITLE_SUFFIX)));
  });

  it('the slideshow moves to the next slide', async () => {
    await world.admin.click(t.common.next);
    await world.admin.until('the second slide address', async () => world.admin.page.url().endsWith('/2'));
    await world.admin.waitFor(t.common.slideOf(2, SAMPLE.slides.length));
  });

  it('the left arrow key moves forward, as the interface reads right to left', async () => {
    await world.admin.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await world.admin.page.keyboard.press('ArrowLeft');
    await world.admin.until('the third slide address', async () => world.admin.page.url().endsWith('/3'));
    await world.admin.waitFor(t.common.slideOf(3, SAMPLE.slides.length));
  });

  it('deleting an option before the correct one keeps the correct answer on the same option text', async () => {
    const before = (await storedLesson(world)).slides[SLIDE.firstQuestion] as ChoiceSlide;
    const correctText = before.options[before.correctIndex ?? -1];
    expect(before.correctIndex).toBeGreaterThan(0);
    await world.admin.goto(`#/lesson/${encodeURIComponent(world.importedLessonId)}/${SLIDE.firstQuestion + 1}`);
    await world.admin.until('the options list in the side panel', () => world.admin.exists('.shell__panel .field__list-row button'));
    await world.admin.page.$eval('.shell__panel .field__list-row button', (button) => (button as HTMLButtonElement).click());
    await world.admin.until('one option fewer', async () => ((await storedLesson(world)).slides[SLIDE.firstQuestion] as ChoiceSlide).options.length === before.options.length - 1);
    const after = (await storedLesson(world)).slides[SLIDE.firstQuestion] as ChoiceSlide;
    expect(after.options[after.correctIndex ?? -1]).toBe(correctText);
  });
}
