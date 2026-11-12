import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { groupNames, numbersShown, openRunningClass, openSignedInTeacher } from '../actions';
import { PHONE, type Device } from '../device';
import type { World } from '../world';

const GIVING_BUTTON = 'button.btn--heart';

const heartLabels = (device: Device) => device.page.$$eval('[aria-label^="' + t.common.hearts + '"]', (elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));

/** A second device of the teacher ends the class while the first watches it end; the student still on her device keeps her own results, and only the teacher can still give hearts. */
export function endOfClassSteps(world: World): void {
  it('ending the class shows the named student her own results, and stops the hearts of the students', async () => {
    const group = (await groupNames(world.admin)).get(world.roster[0].groupId)!;
    await world.admin.goto(`#/board/${world.firstClassCode}`);
    await world.admin.waitFor(t.common.sessionLive);
    expect(await world.admin.has(t.common.sessionEnded)).toBe(false);
    expect(await world.admin.count(GIVING_BUTTON)).toBeGreaterThan(0);
    expect((await heartLabels(world.admin)).some((label) => numbersShown(label, (count) => t.common.heartsOf(group, count)) !== null)).toBe(true);

    await openRunningClass(world.admin, world.firstClassCode);
    const phone = await openSignedInTeacher(world, 'ending device', PHONE);
    await openRunningClass(phone, world.firstClassCode);
    await phone.click(t.session.end, '.shell__panel');
    await phone.click(t.common.confirm, '.shell__panel');
    await world.admin.waitFor(t.session.chooser.endedTitle);
    await world.admin.waitGone(t.session.pacingTitle);
    await phone.page.close();
    await world.student.waitFor(t.join.ended);
    await world.student.waitFor(t.board.myResults(world.roster[0].name));
    expect(await world.student.count('.board__result')).toBeGreaterThan(0);

    for (const page of ['board', 'monitor']) {
      await world.admin.goto(`#/${page}/${world.firstClassCode}`);
      await world.admin.waitFor(t.common.sessionEnded);
      expect(await world.admin.has(t.common.sessionLive)).toBe(false);
      expect(await world.admin.count(GIVING_BUTTON)).toBeGreaterThan(0);
    }
    expect((await heartLabels(world.admin)).length).toBeGreaterThan(0);
    expect(await world.student.count(GIVING_BUTTON)).toBe(0);
  });

  it('after the end the teacher still gives a heart on the monitor and the count goes up, and the monitor has no buttons to change the roll or the minimum', async () => {
    const owner = world.roster[0].name;
    const labels = () => world.admin.page.$$eval('tbody tr button.btn--heart, tbody tr span.chip[aria-label]', (elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));
    const hearts = async () => (await labels()).map((label) => numbersShown(label, (count) => t.common.heartsOf(owner, count))?.[0]).find((count) => count !== undefined) ?? -1;
    await world.admin.goto(`#/monitor/${world.firstClassCode}`);
    await world.admin.waitFor(t.common.sessionEnded);
    const before = await hearts();
    expect(before).toBeGreaterThanOrEqual(0);
    expect(await world.admin.count('button.status__toggle')).toBe(0);
    expect(await world.admin.count(`button[aria-label="${t.monitor.raiseMin}"]`)).toBe(0);
    await world.admin.page.evaluate((label) => document.querySelector<HTMLButtonElement>(`tbody tr button.btn--heart[aria-label="${label}"]`)?.click(), t.common.heartsOf(owner, before));
    await world.admin.until('her hearts going up by one', async () => (await hearts()) === before + 1);
    expect(await world.student.count(GIVING_BUTTON)).toBe(0);
  });
}
