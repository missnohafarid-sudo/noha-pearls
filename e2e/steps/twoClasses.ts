import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { SECOND_CLASS, groupNames, openSignedInTeacher, sessionCodeIn, startClass } from '../actions';
import { Device, DESKTOP, PHONE } from '../device';
import { SAMPLE, slideText } from '../sample';
import { leavingSteps } from './leaving';
import type { World } from '../world';

/** A second teacher starts a class for the second school class while the first is running; neither disturbs the other. */
export function twoClassesSteps(world: World): void {
  let second: Device;
  let secondCode = '';

  it('the first class has its own address with its code', async () => {
    expect(world.firstClassCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(sessionCodeIn(world.admin)).toBe(world.firstClassCode);
  });

  it('a second teacher signs in on her own tab, sees one running class, and starts another', async () => {
    second = await openSignedInTeacher(world, 'second teacher', DESKTOP);
    await second.click(SAMPLE.title);
    await second.waitFor(t.lesson.runningClasses(1));
    await startClass(second, SECOND_CLASS.className, SECOND_CLASS.teacherName);
    await second.waitFor(t.session.pacingTitle);
    secondCode = sessionCodeIn(second);
    expect(secondCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(secondCode).not.toBe(world.firstClassCode);
  });

  it('the first teacher still sees her class and her code, and her student still sees her slide', async () => {
    await world.admin.holds('the first class on the first teacher\'s page', async () => sessionCodeIn(world.admin) === world.firstClassCode && (await world.admin.has(world.firstClassCode)) && (await world.admin.has(t.session.pacingTitle)));
    await world.student.holds('her slide, with no closing message', async () => (await world.student.has(slideText(world.stageSlide))) && !(await world.student.has(t.join.ended)));
  });

  it('the session page without a code lists both classes to choose from, each with its class and teacher', async () => {
    await second.goto('#/session');
    await second.waitFor(t.session.chooser.title);
    await second.until('two running classes', async () => (await second.count('.session-list__item')) === 2);
    expect(await second.has(world.firstClassCode)).toBe(true);
    expect(await second.has(secondCode)).toBe(true);
    expect(await second.has(t.session.startTitle)).toBe(true);
    const rows = await second.texts('.session-list__item');
    const rowOf = (code: string) => rows.find((row) => row.includes(code)) ?? '';
    expect(rowOf(world.firstClassCode)).toContain(t.session.classOf(world.firstClassName));
    expect(rowOf(world.firstClassCode)).toContain(world.firstTeacherName);
    expect(rowOf(secondCode)).toContain(t.session.classOf(SECOND_CLASS.className));
    expect(rowOf(secondCode)).toContain(SECOND_CLASS.teacherName);
  });

  it('the join codes of the second class show only its own group', async () => {
    await second.goto(`#/session/${secondCode}`);
    await second.waitFor(t.session.pacingTitle);
    await second.waitFor(t.session.whose(SECOND_CLASS.className, SECOND_CLASS.teacherName));
    await second.click(t.session.showJoinCodes);
    await second.until('one join code', async () => (await second.count('.qr svg')) === 1);
    await second.waitFor(SECOND_CLASS.groupName);
    await second.click(t.session.hideJoinCodes);
  });

  it('a phone that types the second class\'s code is offered only its group and its students', async () => {
    const phone = await Device.open(world.browser, 'second class phone', world.baseUrl, PHONE, world.errors);
    await phone.waitFor(t.session.joinCode);
    await phone.fill('.join-code input', secondCode);
    await phone.page.keyboard.press('Enter');
    await phone.waitFor(t.home.join.chooseGroup);
    await phone.waitFor(SECOND_CLASS.groupName);
    for (const name of (await groupNames(phone)).values()) if (name !== SECOND_CLASS.groupName) expect(await phone.has(name)).toBe(false);
    await phone.click(SECOND_CLASS.groupName);
    await phone.waitFor(SECOND_CLASS.studentName);
    for (const student of world.roster) expect(await phone.has(student.name)).toBe(false);
    await phone.goto(`#/join/${secondCode}/${world.roster[0].groupId}`);
    await phone.waitFor(t.join.invalidLink);
    await phone.goto(`#/join/${world.firstClassCode}/${world.roster[0].groupId}`);
    await phone.waitFor(world.roster[0].name);
    expect(await phone.has(SECOND_CLASS.studentName)).toBe(false);
    await phone.page.close();
  });

  it('the monitor and the board open each class by its own code', async () => {
    await second.goto(`#/monitor/${world.firstClassCode}`);
    await second.waitFor(t.monitor.onSlide(world.stageSlide + 1));
    await second.goto(`#/monitor/${secondCode}`);
    await second.waitFor(t.monitor.onSlide(1));
    await second.goto(`#/board/${world.firstClassCode}`);
    await second.waitFor(t.board.leaderboard);
    await second.goto(`#/board/${secondCode}`);
    await second.waitFor(t.board.leaderboard);
    expect(second.page.url().endsWith(`#/board/${secondCode}`)).toBe(true);
  });

  it('the navigation keeps the class the teacher is in', async () => {
    const hrefs = await second.page.$$eval('.shell__link', (links) => links.map((link) => (link as HTMLAnchorElement).hash));
    for (const page of ['board', 'session', 'monitor']) expect(hrefs).toContain(`#/${page}/${secondCode}`);
  });

  it('the monitor and the board without a code ask which class when two are running', async () => {
    for (const page of ['monitor', 'board']) {
      await second.goto(`#/${page}`);
      await second.waitFor(t.session.chooser.title);
      expect(await second.count('.session-list__item')).toBe(2);
    }
  });

  leavingSteps(world, () => ({ teacher: second, code: secondCode }));

  it('ending the second class leaves the first running, and the page without a code still shows the overview with it listed', async () => {
    await second.goto(`#/session/${secondCode}`);
    await second.waitFor(t.session.pacingTitle);
    await second.click(t.session.end, '.shell__panel');
    await second.click(t.common.confirm, '.shell__panel');
    await second.waitFor(t.session.chooser.endedTitle);
    await second.goto('#/session');
    await second.waitFor(t.session.startTitle);
    await second.until('the first class as the only running one', async () => {
      const running = (await second.texts('.session-list__item')).filter((row) => row.includes(t.session.chooser.open.session));
      return running.length === 1 && running[0].includes(world.firstClassCode);
    });
    expect(await second.has(t.session.pacingTitle)).toBe(false);
    await world.student.holds('her slide, with no closing message', async () => (await world.student.has(slideText(world.stageSlide))) && !(await world.student.has(t.join.ended)));
    await second.page.close();
  });
}
