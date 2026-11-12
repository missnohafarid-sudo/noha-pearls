import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { choiceLetter } from '../../src/i18n/common';
import { admitWaitingDevice, changeMinimum, openRunningClass, openSignedInTeacher, removeAdmittedDevice, scannerRow, sessionCodeIn, setPresentOnMonitor, shownMinimum } from '../actions';
import { EXPECTED_OPTION_INDEX } from '../cardVideo';
import { Device, PHONE } from '../device';
import { SAMPLE, SLIDE, explanationOf, slideText } from '../sample';
import { CAMERA_CARD_NUMBER, isAdminMode, storedRecords, type World } from '../world';

interface StoredSession {
  code: string;
  slideIndex: number;
}

const QUESTION = SLIDE.firstQuestion + 1;

const tallies = (device: Device) => device.texts('.slide-option__tally b');
const slideCounter = (index: number) => t.common.slideOf(index + 1, SAMPLE.slides.length);

/** One teacher controls the same running class from two devices at once: the laptop on the projector and the phone in her hand. */
export function twoDevicesSteps(world: World): void {
  let phone: Device;

  const storedSlideIndex = async () => (await storedRecords<StoredSession>(world.admin, 'sessions')).find((session) => session.code === world.firstClassCode)!.slideIndex;
  const everyoneShows = async (index: number) => {
    await world.admin.waitFor(slideCounter(index));
    if (!phone.page.isClosed()) await phone.waitFor(slideCounter(index));
    await world.student.waitFor(slideText(index));
  };
  const press = (device: Device, label: string) => device.click(label, '.slide-nav');
  const moveStageFrom = async (device: Device, label: string, delta: number) => {
    await press(device, label);
    world.stageSlide += delta;
    await everyoneShows(world.stageSlide);
  };

  it('she signs in on a second device and opens her running class from the list, and it shows the same slide and the same code', async () => {
    expect(world.stageSlide).toBe(SLIDE.aiClaim);
    phone = await openSignedInTeacher(world, 'teacher phone', PHONE);
    await phone.goto('#/session');
    await phone.waitFor(t.session.chooser.title);
    await phone.click(t.session.chooser.open.session, '.session-list__item');
    await phone.waitFor(t.session.pacingTitle);
    expect(sessionCodeIn(phone)).toBe(world.firstClassCode);
    await phone.waitFor(world.firstClassCode);
    await everyoneShows(world.stageSlide);
  });

  it('she moves to the next slide on the second device and the first device and the student follow', async () => {
    await moveStageFrom(phone, t.common.next, 1);
    expect(await storedSlideIndex()).toBe(world.stageSlide);
  });

  it('both devices pressing next at the same moment from the same slide move the class exactly one slide further', async () => {
    const from = world.stageSlide;
    await Promise.all([press(world.admin, t.common.next), press(phone, t.common.next)]);
    world.stageSlide = from + 1;
    await everyoneShows(world.stageSlide);
    await world.admin.holds('the class one slide further, not two', async () => (await storedSlideIndex()) === from + 1 && !(await world.admin.has(slideCounter(from + 2))) && !(await phone.has(slideCounter(from + 2))));
  });

  it('an answer she records with the second device\'s camera shows in the first device\'s tally', async () => {
    while (world.stageSlide > QUESTION) await moveStageFrom(world.admin, t.common.previous, -1);
    const camera = world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;
    await phone.click(t.session.scan);
    await phone.until(`${camera.name}'s card read on the second device`, async () => (await scannerRow(phone, camera.name)).includes(choiceLetter(EXPECTED_OPTION_INDEX)), 9000);
    await world.admin.until('the first device\'s tally of that option at 1', async () => (await tallies(world.admin))[EXPECTED_OPTION_INDEX] === '1');
  });

  it('revealing on the first device shows the second device the answer and takes its scanner away', async () => {
    await world.admin.click(t.session.reveal);
    await phone.waitFor(explanationOf(QUESTION));
    await phone.waitGone(t.session.closeScan);
    await phone.holds('no way to scan an answer for the revealed question', async () => !(await phone.has(t.session.scan)) && !(await phone.has(t.session.closeScan)));
    await world.admin.holds('the first device with no scanner either', async () => !(await world.admin.has(t.session.scan)));
    while (world.stageSlide < SLIDE.aiClaim) await moveStageFrom(world.admin, t.common.next, 1);
  });

  it('the roll and the minimum she changes on the second device\'s monitor show on the first device\'s, and she puts them back', async () => {
    const student = world.roster[0].name;
    const rowOf = async (device: Device) => (await device.texts('tbody tr')).find((row) => row.includes(student)) ?? '';
    for (const device of [world.admin, phone]) {
      await device.goto(`#/monitor/${world.firstClassCode}`);
      await device.waitFor(t.monitor.onSlide(world.stageSlide + 1));
    }
    await setPresentOnMonitor(phone, student, false);
    await world.admin.until('her absence on the first device', async () => (await rowOf(world.admin)).includes(t.common.absent));
    await setPresentOnMonitor(phone, student, true);
    await world.admin.until('her absence gone on the first device', async () => !(await rowOf(world.admin)).includes(t.common.absent));

    const before = (await shownMinimum(phone))!;
    await changeMinimum(phone, t.monitor.lowerMin, -1);
    await world.admin.until('the lowered minimum on the first device', async () => (await shownMinimum(world.admin)) === before - 1);
    await changeMinimum(phone, t.monitor.raiseMin, 1);
    await world.admin.until('the minimum back on the first device', async () => (await shownMinimum(world.admin)) === before);

    await openRunningClass(world.admin, world.firstClassCode);
    await openRunningClass(phone, world.firstClassCode);
  });

  it('a waiting student device let in from the second device brings the first device\'s waiting count down', async () => {
    const late = await Device.open(world.browser, 'late device', world.joinUrl, PHONE, world.errors);
    await late.click(t.join.sharedDevice);
    await late.waitFor(t.join.admissionTitle);
    await world.admin.waitFor(t.session.admission.waitingCount(1));
    await phone.waitFor(t.session.admission.waitingCount(1));
    await admitWaitingDevice(phone);
    await late.waitFor(slideText(world.stageSlide));
    await world.admin.waitFor(t.session.admission.nobodyWaiting);
    await world.admin.waitGone(t.session.admission.waitingCount(1));
    await removeAdmittedDevice(world.admin, t.join.sharedDeviceLabel);
    await late.waitFor(t.join.chooseName);
    await late.page.close();
  });

  it('she signs out on the second device and the first device still controls the class', async () => {
    await phone.click(t.shell.signOut);
    await phone.until('the second device signed out', async () => !(await isAdminMode(phone)));
    await phone.page.close();
    await world.admin.holds('the first device still signed in', () => isAdminMode(world.admin));
    await moveStageFrom(world.admin, t.common.next, 1);
    await world.admin.waitFor(slideCounter(world.stageSlide));
    await moveStageFrom(world.admin, t.common.previous, -1);
  });
}
