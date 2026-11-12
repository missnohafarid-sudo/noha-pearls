import type { ElementHandle, KeyInput } from 'puppeteer';
import { t } from '../src/i18n';
import { Device, type Viewport } from './device';
import { slideText } from './sample';
import type { World } from './world';
import { openSignIn, signInAsAdmin, storedRecords } from './world';

/** Moves the teacher's presentation forward until it shows slide `index` (0-based). */
export async function presentUpTo(world: World, index: number): Promise<void> {
  while (world.stageSlide < index) {
    await world.admin.click(t.common.next);
    world.stageSlide += 1;
    await world.admin.waitFor(slideText(world.stageSlide));
  }
}

/** The teacher taps «إدخال» on the first device waiting in her panel. */
export function admitWaitingDevice(admin: Device): Promise<void> {
  return admin.click(t.session.admission.admit, '.shell__panel');
}

/** The teacher opens the admission scanner from her panel, unless it is already open. */
export async function openAdmissionScanner(admin: Device): Promise<void> {
  if (!(await admin.has(t.scanner.admitHint))) await admin.click(t.session.admission.scan, '.shell__panel');
}

/**
 * The teacher opens the «داخل الحصة» list and sends out the one held under `studentName`: one press arms the row's button,
 * the next confirms. A row that was already leaving may vanish between the presses, so each poll presses what is armed, else arms.
 */
export async function removeAdmittedDevice(admin: Device, studentName: string): Promise<void> {
  const insideOpen = () => admin.page.evaluate(() => document.querySelector('.summary-row')?.closest('details')?.open ?? false);
  if (!(await insideOpen())) await admin.click(t.session.admission.inside, '.shell__panel');
  const pressUntilConfirmed = () =>
    admin.page.evaluate(
      (name, confirm) => {
        const buttons = [...document.querySelectorAll<HTMLElement>('.shell__panel details .admission__item')]
          .filter((item) => item.innerText.includes(name))
          .flatMap((item) => [...item.querySelectorAll('button')]);
        const armed = buttons.find((button) => button.innerText.includes(confirm));
        (armed ?? buttons[0])?.click();
        return armed !== undefined;
      },
      studentName,
      t.common.confirm,
    );
  await admin.until(`the remove button of ${studentName} pressed and confirmed`, pressUntilConfirmed);
}

/** A new tab of a teacher who signs in the normal way: another device of hers. */
export async function openSignedInTeacher(world: World, name: string, viewport: Viewport): Promise<Device> {
  const device = await Device.open(world.browser, name, world.baseUrl, viewport, world.errors);
  await openSignIn(device);
  await signInAsAdmin(device);
  return device;
}

/** The row of the card scanner's student list that holds `name`: her card number, her name and the letter she answered, or empty. */
export function scannerRow(device: Device, name: string): Promise<string> {
  return device.texts('.scanner__student').then((rows) => rows.find((row) => row.includes(name)) ?? '');
}

/** What the walkthrough adds as the second school class, so it can tell it from the seeded one. */
export const SECOND_CLASS = {
  className: 'Second Class',
  groupName: 'Second Group',
  studentName: 'Second Student',
  teacherName: 'Second Teacher',
} as const;

/** Types a new text into the field that shows `current` inside `scope`, the way typing does. */
export async function retype(device: Device, scope: string, current: string, next: string): Promise<void> {
  const attempt = () =>
    device.page.evaluate(
      (scopeSelector, from, to) => {
        const field = [...document.querySelectorAll<HTMLInputElement>(`${scopeSelector} input`)].find((input) => input.value === from);
        if (!field) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, to);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      },
      scope,
      current,
      next,
    );
  await device.until(`a field holding "${current}" inside ${scope}`, attempt);
}

/** How a test finds one of our drop-downs: by the visible label of its field, or by its own accessible name. */
export type DropDown = { fieldLabel: string } | { ariaLabel: string };

/** The drop-down's button (the lesson page also has a text field named «الصف», so a label alone is not enough), or null when it is not on the page. */
export async function findDropDown(device: Device, drop: DropDown): Promise<ElementHandle<HTMLElement> | null> {
  const handle = await device.page.evaluateHandle((wanted) => {
    if ('ariaLabel' in wanted) return document.querySelector<HTMLElement>(`[role=combobox][aria-label="${wanted.ariaLabel}"]`);
    const field = [...document.querySelectorAll<HTMLElement>('label.field')].find((candidate) => candidate.querySelector('.field__label')?.textContent?.trim() === wanted.fieldLabel);
    return field?.querySelector<HTMLElement>('[role=combobox]') ?? null;
  }, drop);
  return handle.asElement() as ElementHandle<HTMLElement> | null;
}

/** Focuses a drop-down's button and presses keys on it, one after another, as a person at a keyboard does. `Alt+ArrowUp` holds Alt while pressing. */
export async function pressInDropDown(device: Device, drop: DropDown, ...keys: string[]): Promise<void> {
  const box = await findDropDown(device, drop);
  if (!box) throw new Error(`The drop-down ${JSON.stringify(drop)} is not on the page.`);
  await box.focus();
  for (const key of keys) {
    const [modifier, pressed] = key.includes('+') ? (key.split('+') as [KeyInput, KeyInput]) : [null, key as KeyInput];
    if (modifier) await device.page.keyboard.down(modifier);
    await device.page.keyboard.press(pressed);
    if (modifier) await device.page.keyboard.up(modifier);
  }
}

/** What a drop-down shows right now: whether its list is open, and while it is, the highlighted option, the last option and where the list sits. */
export async function dropDownState(device: Device, drop: DropDown): Promise<{ open: boolean; active: string | null; last: string | null; listParent: string | null }> {
  const box = await findDropDown(device, drop);
  if (!box) throw new Error(`The drop-down ${JSON.stringify(drop)} is not on the page.`);
  return box.evaluate((element) => {
    const active = document.getElementById(element.getAttribute('aria-activedescendant') ?? '');
    const list = document.getElementById(element.getAttribute('aria-controls') ?? '');
    return { open: element.getAttribute('aria-expanded') === 'true', active: active?.textContent ?? null, last: list?.lastElementChild?.textContent ?? null, listParent: list?.parentElement?.tagName ?? null };
  });
}

/** The text a drop-down shows closed: the option it holds. */
export async function dropDownValue(device: Device, drop: DropDown): Promise<string | null> {
  const box = await findDropDown(device, drop);
  return box ? box.evaluate((element) => element.textContent) : null;
}

/** Picks an option the way a person does: opens the drop-down, then presses the option with this text in its list. */
export async function pickOption(device: Device, drop: DropDown, optionText: string): Promise<void> {
  const attempt = async () => {
    const box = await findDropDown(device, drop);
    if (!box) return false;
    return box.evaluate((element, wanted) => {
      const list = document.getElementById(element.getAttribute('aria-controls') ?? '');
      if (!list) {
        element.click();
        return false;
      }
      const option = [...list.querySelectorAll<HTMLElement>('[role=option]')].find((candidate) => candidate.textContent === wanted);
      option?.click();
      return option !== undefined;
    }, optionText);
  };
  await device.until(`the option "${optionText}" in the drop-down ${JSON.stringify(drop)}`, attempt);
}

/** On a page that shows the start form: picks the class and the teacher, then starts the class. */
export async function startClass(device: Device, className: string, teacherName: string): Promise<void> {
  await pickOption(device, { fieldLabel: t.session.startForm.class }, className);
  await pickOption(device, { fieldLabel: t.session.startForm.teacher }, teacherName);
  await device.click(t.session.start);
}

/** The code of the class a teacher's page is showing, read from its address. */
export function sessionCodeIn(device: Device): string {
  return /#\/session\/([A-Z2-9]+)$/.exec(device.page.url())?.[1] ?? '';
}

/** Opens the running class with this code on the teacher's page. */
export async function openRunningClass(device: Device, code: string): Promise<void> {
  await device.goto(`#/session/${code}`);
  await device.waitFor(t.session.pacingTitle);
}

const GROUPS_TODAY = t.session.groupsToday;

/** On a class page: opens the «طالبات الحصة» list, unless it is already open. */
export async function openGroupsToday(admin: Device): Promise<void> {
  if (!(await admin.has(GROUPS_TODAY.note))) await admin.click(GROUPS_TODAY.open, '.shell__panel');
  await admin.waitFor(GROUPS_TODAY.note);
}

/** In the open «طالبات الحصة» list: picks the group named `groupName` in the drop-down of `studentName`. */
export function moveStudentToday(admin: Device, studentName: string, groupName: string): Promise<void> {
  return pickOption(admin, { ariaLabel: GROUPS_TODAY.moveStudent(studentName) }, groupName);
}

async function setPresentIn(admin: Device, rowSelector: string, studentName: string, present: boolean): Promise<void> {
  const state = (press: boolean) =>
    admin.page.evaluate(
      (rows, name, doPress, presentLabel) => {
        const row = [...document.querySelectorAll<HTMLElement>(rows)].find((item) => item.innerText.includes(name));
        const button = row?.querySelector<HTMLButtonElement>('button.status__toggle');
        if (!button) return null;
        const isPresent = button.innerText.trim() === presentLabel;
        if (doPress) button.click();
        return isPresent;
      },
      rowSelector,
      studentName,
      press,
      t.common.present,
    );
  let current: boolean | null = null;
  await admin.until(`the attendance button of ${studentName}`, async () => (current = await state(false)) !== null);
  if (current !== present) await state(true);
  await admin.until(`${studentName} marked ${present ? 'present' : 'absent'}`, async () => (await state(false)) === present);
}

/** In the open «طالبات الحصة» list: presses the attendance button of `studentName` once if she is not already marked as wanted, then waits for it. */
export function setPresentToday(admin: Device, studentName: string, present: boolean): Promise<void> {
  return setPresentIn(admin, '.session-groups__student', studentName, present);
}

/** On the monitor: the same, with the button in her row of the table. */
export function setPresentOnMonitor(admin: Device, studentName: string, present: boolean): Promise<void> {
  return setPresentIn(admin, 'tbody tr', studentName, present);
}

/** In the open «طالبات الحصة» list: types a name in the add form of the group named `groupName` and presses add. */
export async function addStudentToday(admin: Device, groupName: string, studentName: string): Promise<void> {
  const inSection = (action: 'type' | 'press') =>
    admin.page.evaluate(
      (nameLabel, addLabel, group, name, doing) => {
        const section = [...document.querySelectorAll('section')].find((candidate) => candidate.querySelector<HTMLInputElement>(`input[aria-label="${nameLabel}"]`)?.value === group);
        const input = section?.querySelector<HTMLInputElement>(`input[aria-label="${addLabel}"]`);
        if (!section || !input) return false;
        if (doing === 'type') {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, name);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
        const button = section.querySelector<HTMLButtonElement>('button[type=submit]');
        if (!button || button.disabled) return false;
        button.click();
        return true;
      },
      GROUPS_TODAY.groupName,
      GROUPS_TODAY.addStudent,
      groupName,
      studentName,
      action,
    );
  await admin.until(`the add form of ${groupName}`, () => inSection('type'));
  await admin.until(`the add button of ${groupName}`, () => inSection('press'));
}

export interface StoredGroup {
  id: string;
  name: string;
  order: number;
}

export async function groupNames(device: Device): Promise<Map<string, string>> {
  const groups = await storedRecords<StoredGroup>(device, 'groups');
  return new Map(groups.map((group) => [group.id, group.name]));
}

const NUMBER = '(\\d+(?:\\.\\d+)?)';

/** Builds the pattern of a text with numbers in it from the app's own template, so the words are never repeated here. */
function templatePattern(template: (...numbers: number[]) => string, count: number): RegExp {
  const marks = Array.from({ length: count }, (_, i) => 900_001 + i);
  let pattern = template(...marks).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const mark of marks) pattern = pattern.replace(String(mark), NUMBER);
  return new RegExp(pattern);
}

/** The numbers a text shows in the shape of `template` (for example the request number of a waiting device), or null when it shows none. */
export function numbersShown(text: string, template: (...numbers: number[]) => string, count = 1): number[] | null {
  const found = templatePattern(template, count).exec(text);
  return found ? found.slice(1).map(Number) : null;
}

/** The score a board shows for one group. */
export async function boardScore(board: Device, groupName: string): Promise<number> {
  const rows = await board.texts('.board__rank');
  const row = rows.find((text) => text.includes(groupName));
  const found = row ? numbersShown(row, t.common.scoreOf, 2) : null;
  if (!found) throw new Error(`The board shows no score for the group "${groupName}". Its ranking rows are: ${rows.join(' | ')}`);
  return found[0];
}

/** The minimum of interactions a monitor shows beside its label, or null when it shows none. */
export function shownMinimum(device: Device): Promise<number | null> {
  return device.page.evaluate((label) => {
    const named = [...document.querySelectorAll<HTMLElement>('span.muted')].find((element) => element.innerText.trim() === label);
    const shown = named?.parentElement?.querySelector<HTMLElement>('strong, input');
    return shown ? Number(shown instanceof HTMLInputElement ? shown.value : shown.innerText) : null;
  }, t.monitor.minInteractions);
}

/** Presses the monitor's «−» or «+» (`label`) once and waits until the minimum has moved by `delta`. */
export async function changeMinimum(device: Device, label: string, delta: number): Promise<void> {
  const before = (await shownMinimum(device))!;
  await device.page.evaluate((selector) => document.querySelector<HTMLButtonElement>(selector)?.click(), `button[aria-label="${label}"]`);
  await device.until(`the minimum moving from ${before} to ${before + delta}`, async () => (await shownMinimum(device)) === before + delta);
}
