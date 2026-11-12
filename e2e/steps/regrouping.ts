import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { addStudentToday, groupNames, moveStudentToday, openGroupsToday, retype } from '../actions';
import { Device, PHONE } from '../device';
import { storedRecords, type RosterEntry, type World } from '../world';

const PANEL = '.shell__panel';
const ADDED_TODAY = 'Added Today';
const RENAMED = 'Renamed On The List';

interface StoredRoster {
  id: string;
  groups: { id: string; name: string }[];
  students: RosterEntry[];
}

/** A running class owns its groups and students: today's changes stay in it, and the class list stays out of it. */
export function regroupingSteps(world: World): void {
  const student = () => world.roster[0];
  let oldGroup = '';
  let newGroup = '';

  const headerGroup = async () => (await world.student.texts('.join__header strong'))[0];
  const sessionRoster = async () => (await storedRecords<StoredRoster>(world.admin, 'rosters')).find((roster) => roster.students.some((s) => s.name === student().name));
  const listStudent = async () => (await storedRecords<RosterEntry>(world.admin, 'students')).find((s) => s.cardNumber === student().cardNumber && s.groupId === student().groupId);

  it('the teacher opens «طالبات الحصة» and sees the groups of the class with their students', async () => {
    const names = await groupNames(world.admin);
    oldGroup = names.get(student().groupId)!;
    newGroup = names.get(world.roster.find((s) => s.groupId !== student().groupId)!.groupId)!;
    await openGroupsToday(world.admin);
    await world.admin.waitFor(student().name);
    await world.admin.waitFor(oldGroup);
    await world.admin.waitFor(newGroup);
  });

  it('moving a student there moves her device to the new group, while the students page keeps the old one', async () => {
    await moveStudentToday(world.admin, student().name, newGroup);
    await world.student.until('her new group in the header', async () => (await headerGroup()) === newGroup);
    expect(await world.student.has(t.join.chooseName)).toBe(false);
    expect((await sessionRoster())!.students.find((s) => s.name === student().name)!.groupId).not.toBe(student().groupId);
    expect(await listStudent()).toBeDefined();
    await world.admin.page.keyboard.press('Escape');
    await world.admin.goto('#/roster');
    await world.admin.waitFor(student().name);
    const onList = await world.admin.page.evaluate((name, group) => [...document.querySelectorAll('section')].find((section) => section.innerText.includes(name))?.innerText.includes(group) ?? false, student().name, oldGroup);
    expect(onList).toBe(true);
  });

  it('a student added for today appears on that class\'s join page and not on the class list', async () => {
    await world.admin.goto(`#/session/${world.firstClassCode}`);
    await openGroupsToday(world.admin);
    await addStudentToday(world.admin, oldGroup, ADDED_TODAY);
    await world.admin.waitFor(ADDED_TODAY);
    const phone = await Device.open(world.browser, 'added student phone', world.joinUrl, PHONE, world.errors);
    await phone.waitFor(ADDED_TODAY);
    await phone.page.close();
    const listed = await storedRecords<RosterEntry>(world.admin, 'students');
    expect(listed.some((s) => s.name === ADDED_TODAY)).toBe(false);
  });

  it('renaming a student on the students page after the class started does not change her name in the running class', async () => {
    await world.admin.goto('#/roster');
    await world.admin.waitFor(student().name);
    await world.admin.click(student().name);
    await retype(world.admin, PANEL, student().name, RENAMED);
    await world.admin.until('the new name stored on the list', async () => (await storedRecords<RosterEntry>(world.admin, 'students')).some((s) => s.name === RENAMED));
    expect(await world.student.has(student().name)).toBe(true);
    expect(await world.student.has(RENAMED)).toBe(false);
    await world.admin.goto(`#/session/${world.firstClassCode}`);
    await openGroupsToday(world.admin);
    await world.admin.waitFor(student().name);
    expect(await world.admin.has(RENAMED)).toBe(false);
  });

  it('the list gets its old name back, so later steps start from the original class list', async () => {
    await world.admin.page.keyboard.press('Escape');
    await world.admin.goto('#/roster');
    await world.admin.waitFor(RENAMED);
    await world.admin.click(RENAMED);
    await retype(world.admin, PANEL, RENAMED, student().name);
    await world.admin.until('the old name stored again', async () => (await listStudent())?.name === student().name);
  });

  it('«كل الحصص» in the class panel leads to the overview, which lists the one running class and the other tools', async () => {
    await world.admin.goto(`#/session/${world.firstClassCode}`);
    await world.admin.click(t.session.allClasses, PANEL);
    await world.admin.waitFor(t.session.chooser.title);
    await world.admin.waitFor(t.session.startTitle);
    await world.admin.waitFor(t.session.teachers.title);
    expect(await world.admin.has(world.firstClassCode)).toBe(true);
    expect(await world.admin.has(t.session.pacingTitle)).toBe(false);
  });
}
