import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { SECOND_CLASS, admitWaitingDevice, openSignedInTeacher, sessionCodeIn, startClass } from '../actions';
import { DESKTOP, Device, PHONE } from '../device';
import { SAMPLE, SLIDE, slideText } from '../sample';
import type { World } from '../world';
import { dragName, namesUnder, tapName } from './memberDrag';

const CODE_FIELD = '.join-code input';
const NAME = SECOND_CLASS.studentName;
const GIVEN = { mouse: 0, touch: 1, tap: 2 } as const;

/**
 * A shared group device of a third class (of the second school class, so no later step reads it) answers an individual choice
 * question one student at a time: her name is moved by mouse, by finger and by two taps, and shows under the option she was given.
 * The class ends at the end of the lane.
 */
export function memberAnswersSteps(world: World): void {
  let teacher: Device;
  let shared: Device;

  const joinSharedDevice = async (device: Device, code: string) => {
    await device.fill(CODE_FIELD, code);
    await device.page.keyboard.press('Enter');
    await device.click(SECOND_CLASS.groupName);
    await device.click(t.join.sharedDevice);
    await device.waitFor(t.join.admissionTitle);
  };
  const nameIn = (option: number) => namesUnder(shared, option).then((names) => names.filter((name) => name.includes(NAME)));
  const expectNameOnlyUnder = async (option: number) => {
    await shared.until(`her name under option ${option}`, async () => (await nameIn(option)).length === 1);
    for (const other of [0, 1, 2].filter((index) => index !== option)) expect(await nameIn(other)).toEqual([]);
  };

  it('a third class of the second school class starts, and its group\'s shared device is let in and shown the individual choice question', async () => {
    teacher = await openSignedInTeacher(world, 'third class teacher', DESKTOP);
    await teacher.click(SAMPLE.title);
    await startClass(teacher, SECOND_CLASS.className, SECOND_CLASS.teacherName);
    await teacher.waitFor(t.session.pacingTitle);
    shared = await Device.open(world.browser, 'third class shared device', world.baseUrl, PHONE, world.errors);
    await shared.page.setViewport({ ...PHONE, hasTouch: true });
    await joinSharedDevice(shared, sessionCodeIn(teacher));
    await teacher.until('the device in the waiting list', () => teacher.has(t.session.admission.admit));
    await admitWaitingDevice(teacher);
    for (let slide = 0; slide <= SLIDE.poll; slide += 1) {
      if (slide > 0) await teacher.click(t.common.next);
      await shared.waitFor(slideText(slide));
    }
    await shared.waitFor(t.join.answersPerStudentOnGroupDevice);
  });

  it('shows the group\'s names above the options, none of them under an option yet', async () => {
    await shared.until('her name in the row', async () => (await shared.texts('.member-row .name-chip')).some((name) => name.includes(NAME)));
    expect(await shared.has(t.join.onOwnDevice)).toBe(false);
    for (const option of [0, 1, 2]) expect(await namesUnder(shared, option)).toEqual([]);
  });

  it('moving her name onto an option with the mouse gives her that answer, and she appears under it', async () => {
    await dragName(shared, NAME, GIVEN.mouse, 'mouse');
    await expectNameOnlyUnder(GIVEN.mouse);
  });

  it('moving her name from under one option onto another with a finger gives her the new answer', async () => {
    await dragName(shared, NAME, GIVEN.touch, 'touch', '.member-pick .name-chip');
    await expectNameOnlyUnder(GIVEN.touch);
  });

  it('choosing her name with a tap and then an option gives her that answer, and says whose answer is being chosen', async () => {
    await tapName(shared, NAME, GIVEN.tap);
    await expectNameOnlyUnder(GIVEN.tap);
    expect(await shared.has(t.join.choosingFor(NAME))).toBe(false);
  });

  it('a chosen name can be let go with a second tap and with Escape, and no option is then given to her', async () => {
    await shared.page.evaluate((css) => document.querySelector<HTMLElement>(css)?.click(), '.member-row .name-chip');
    await shared.waitFor(t.join.choosingFor(NAME));
    await shared.page.evaluate((css) => document.querySelector<HTMLElement>(css)?.click(), '.member-row .name-chip');
    await shared.waitGone(t.join.choosingFor(NAME));
    await shared.page.evaluate((css) => document.querySelector<HTMLElement>(css)?.click(), '.member-row .name-chip');
    await shared.waitFor(t.join.choosingFor(NAME));
    await shared.page.keyboard.press('Escape');
    await shared.waitGone(t.join.choosingFor(NAME));
    await expectNameOnlyUnder(GIVEN.tap);
  });

  it('when she opens a device of her own, her name is a disabled chip marked as being on her own device, and her pick leaves the grids', async () => {
    const own = await Device.open(world.browser, 'third class student device', world.baseUrl, PHONE, world.errors);
    await own.fill(CODE_FIELD, sessionCodeIn(teacher));
    await own.page.keyboard.press('Enter');
    await own.click(SECOND_CLASS.groupName);
    await own.click(NAME);
    await own.waitFor(t.join.admissionTitle);
    await teacher.until('her request in the waiting list', () => teacher.has(t.session.admission.admit));
    await admitWaitingDevice(teacher);
    await shared.waitFor(t.join.onOwnDevice);
    expect(await shared.count('.member-row .name-chip--away')).toBe(1);
    expect(await shared.count('.member-row button.name-chip')).toBe(0);
    for (const option of [0, 1, 2]) expect(await namesUnder(shared, option)).toEqual([]);
    await own.page.close();
  });

  it('ends the third class', async () => {
    await shared.page.close();
    await teacher.click(t.session.end, '.shell__panel');
    await teacher.click(t.common.confirm, '.shell__panel');
    await teacher.waitFor(t.session.chooser.endedTitle);
    await teacher.page.close();
  });
}
