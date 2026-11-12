import type { KeyInput } from 'puppeteer';
import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { SECOND_CLASS, dropDownValue, findDropDown, retype } from '../actions';
import { SAMPLE } from '../sample';
import { storedRecords, type World } from '../world';

interface Named {
  id: string;
  name: string;
}

interface StoredStudent extends Named {
  cardNumber: number;
  groupId: string;
}

interface StoredGroup extends Named {
  classId: string;
}

const PANEL = '.shell__panel';

/** Classes and teachers as defined lists: the start form, a second teacher, a second class with its own card 1. */
export function classesSteps(world: World): void {
  it('with one class and one teacher the start form has them chosen already', async () => {
    const [seededClass] = await storedRecords<Named>(world.admin, 'classes');
    const [seededTeacher] = await storedRecords<Named>(world.admin, 'teachers');
    world.firstClassName = seededClass.name;
    world.firstTeacherName = seededTeacher.name;
    await world.admin.goto('#/session');
    await world.admin.waitFor(t.session.startTitle);
    await world.admin.until('the class and the teacher chosen', async () => {
      const chosen = await world.admin.page.$$eval('label.field [role=combobox]', (boxes) => boxes.map((box) => box.textContent ?? ''));
      return chosen.join('|') === [world.firstClassName, world.firstTeacherName].join('|');
    });
    const startEnabled = await world.admin.page.$$eval('button', (buttons, label) => buttons.some((button) => button.textContent?.includes(label) && !button.disabled), t.session.start);
    expect(startEnabled).toBe(true);
  });

  it('the teacher adds a second teacher to the list and renames her', async () => {
    await world.admin.click(t.session.teachers.add, PANEL);
    await retype(world.admin, PANEL, t.session.teachers.defaultName, SECOND_CLASS.teacherName);
    await world.admin.until('the second teacher stored', async () => (await storedRecords<Named>(world.admin, 'teachers')).some((teacher) => teacher.name === SECOND_CLASS.teacherName));
  });

  it('a drop-down works with the keyboard alone, and Escape closes it without choosing', async () => {
    const teacher = { fieldLabel: t.session.startForm.teacher };
    await world.admin.goto('#/session');
    await world.admin.waitFor(t.session.startTitle);
    await world.admin.until('the teacher drop-down waiting for a choice', async () => (await dropDownValue(world.admin, teacher)) === t.session.startForm.pickTeacher);
    await (await findDropDown(world.admin, teacher))!.focus();
    const press = (key: KeyInput) => world.admin.page.keyboard.press(key);
    const listIsOpen = () => world.admin.exists('[role=listbox]');

    await press('Enter');
    await world.admin.until('the list open', listIsOpen);
    await press('ArrowDown');
    await press('Enter');
    await world.admin.until('the list closed', async () => !(await listIsOpen()));
    await world.admin.until('the first teacher chosen', async () => (await dropDownValue(world.admin, teacher)) === world.firstTeacherName);

    await press('ArrowDown');
    await world.admin.until('the list open again', listIsOpen);
    await press('ArrowDown');
    await press('Escape');
    await world.admin.until('the list closed by Escape', async () => !(await listIsOpen()));
    expect(await dropDownValue(world.admin, teacher)).toBe(world.firstTeacherName);
  });

  it('the teacher adds a second class with one group and one student, who gets card 1', async () => {
    await world.admin.goto('#/roster');
    await world.admin.waitFor(world.roster[0].name);
    await world.admin.click(t.roster.newClass);
    await world.admin.until('the new class in the address', async () => /#\/roster\/[^/]+$/.test(world.admin.page.url()) && !world.admin.page.url().endsWith('/roster'));
    await retype(world.admin, PANEL, t.roster.defaultClassName, SECOND_CLASS.className);
    await world.admin.waitFor(SECOND_CLASS.className);
    await world.admin.click(t.roster.addGroup, PANEL);
    await retype(world.admin, PANEL, t.roster.defaultGroupName, SECOND_CLASS.groupName);
    await world.admin.waitFor(SECOND_CLASS.groupName);
    await world.admin.click(t.roster.addStudent);
    await retype(world.admin, PANEL, t.roster.defaultStudentName, SECOND_CLASS.studentName);
    await world.admin.waitFor(SECOND_CLASS.studentName);
    await world.admin.waitFor(t.roster.cardNumber(1));
  });

  it('both classes hold a card 1, and each page shows only its own class', async () => {
    const students = await storedRecords<StoredStudent>(world.admin, 'students');
    const groups = await storedRecords<StoredGroup>(world.admin, 'groups');
    const classOf = (student: StoredStudent) => groups.find((group) => group.id === student.groupId)?.classId;
    const ones = students.filter((student) => student.cardNumber === 1);
    expect(ones).toHaveLength(2);
    expect(new Set(ones.map(classOf)).size).toBe(2);

    await world.admin.goto('#/roster');
    const first = (await storedRecords<Named>(world.admin, 'classes')).find((schoolClass) => schoolClass.name === world.firstClassName);
    await world.admin.until('the first class picked and put in the address', async () => world.admin.page.url().endsWith(`#/roster/${first?.id}`));
    await world.admin.waitFor(world.roster[0].name);
    expect(await world.admin.has(SECOND_CLASS.studentName)).toBe(false);
  });

  it('the cards page of the second class prints only its student and names the class', async () => {
    await world.admin.click(SECOND_CLASS.className);
    await world.admin.waitFor(SECOND_CLASS.studentName);
    await world.admin.click(t.roster.openCards);
    await world.admin.waitFor(t.cards.title(SECOND_CLASS.className));
    await world.admin.until('one marker', async () => (await world.admin.count('.answer-card svg')) === 1);
    expect(await world.admin.has(world.roster[0].name)).toBe(false);
    await world.admin.goto('#/');
    await world.admin.waitFor(SAMPLE.title);
  });
}
