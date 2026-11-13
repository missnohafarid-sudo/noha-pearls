import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { admitWaitingDevice, dropDownState, dropDownValue, groupNames, numbersShown, openAdmissionScanner, presentUpTo, pressInDropDown, removeAdmittedDevice, sessionCodeIn, startClass } from '../actions';
import { Device, PHONE } from '../device';
import { SAMPLE, SLIDE, explanationOf, slideText } from '../sample';
import { CAMERA_CARD_NUMBER, type World } from '../world';

export const GROUP_ANSWER = 'We let sunlight evaporate the water in a bowl, then collect the drops from a cold lid.';

const tallies = (device: Device) => device.texts('.slide-option__tally b');

/** The teacher starts a class; a student's phone joins and follows, answers, and is paced. */
export function liveClassSteps(world: World): void {
  let cardDevice: Device;
  let secondDevice: Device;

  it('starting a class opens the session console', async () => {
    await world.admin.goto('#/');
    await world.admin.waitFor(SAMPLE.title);
    await world.admin.click(SAMPLE.title);
    await startClass(world.admin, world.firstClassName, world.firstTeacherName);
    await world.admin.waitFor(t.session.pacingTitle);
    expect(world.admin.page.url()).toMatch(/#\/session\/[A-Z2-9]{6}$/);
    world.firstClassCode = sessionCodeIn(world.admin);
  });

  it('before any roll the panel says no roll was taken and counts the whole class', async () => {
    await world.admin.waitFor(t.session.admission.noRollYet);
    await world.admin.waitFor(t.session.admission.scan);
  });

  it('join codes show one QR per group', async () => {
    await world.admin.click(t.session.showJoinCodes);
    const joinLink = () => world.admin.page.evaluate((groupId) => [...document.querySelectorAll('a')].find((a) => a.href.includes('#/join/') && a.href.endsWith(`/${groupId}`))?.href ?? '', world.roster[0].groupId);
    await world.admin.until('the join link of the first group', async () => (await joinLink()) !== '');
    world.joinUrl = await joinLink();
    expect(await world.admin.count('.qr svg')).toBe(new Set(world.roster.map((student) => student.groupId)).size);
    await world.admin.click(t.session.hideJoinCodes);
    world.stageSlide = SLIDE.opening;
  });

  it('the message drop-down on the class page answers the keyboard: End opens on the last group, Escape closes, Alt+ArrowUp chooses, Home and Enter choose the first', async () => {
    const drop = { ariaLabel: t.session.messageTo };
    const first = await dropDownValue(world.admin, drop);
    await pressInDropDown(world.admin, drop, 'End');
    const opened = await dropDownState(world.admin, drop);
    expect(opened).toMatchObject({ open: true, listParent: 'BODY' });
    expect(opened.active).toBe(opened.last);
    expect(opened.active).not.toBe(first);
    await pressInDropDown(world.admin, drop, 'Escape');
    expect((await dropDownState(world.admin, drop)).open).toBe(false);
    expect(await dropDownValue(world.admin, drop)).toBe(first);
    await world.admin.waitFor(t.session.pacingTitle);
    await pressInDropDown(world.admin, drop, 'End');
    const reopened = await dropDownState(world.admin, drop);
    expect(reopened.active).toBe(reopened.last);
    await pressInDropDown(world.admin, drop, 'Alt+ArrowUp');
    expect((await dropDownState(world.admin, drop)).open).toBe(false);
    expect(await dropDownValue(world.admin, drop)).toBe(reopened.last);
    await pressInDropDown(world.admin, drop, 'Home', 'Enter');
    expect(await dropDownValue(world.admin, drop)).toBe(first);
  });

  it('a student device shows the name picker and no site frame', async () => {
    world.student = await Device.open(world.browser, 'student', world.joinUrl, PHONE, world.errors);
    await world.student.waitFor(t.join.chooseName);
    expect(await world.student.exists('.shell__bar')).toBe(false);
    expect(await world.student.has(t.join.seatLost)).toBe(false);
  });

  it('a student who picks her name waits outside the class until the teacher taps her device', async () => {
    await world.student.click(world.roster[0].name);
    await world.student.waitFor(t.join.admissionTitle);
    await world.student.holds('the waiting screen without the slide', async () => !(await world.student.has(slideText(SLIDE.opening))));
    await world.admin.waitFor(world.roster[0].name);
  });

  it('the student follows the teacher to the first slide once the teacher lets her in', async () => {
    await admitWaitingDevice(world.admin);
    await world.student.waitFor(slideText(SLIDE.opening));
    await world.student.waitGone(t.join.admissionTitle);
  });

  it('a second device can ask for a name another device holds, and letting it in moves the name', async () => {
    const owner = world.roster[0];
    secondDevice = await Device.open(world.browser, 'second', world.joinUrl, PHONE, world.errors);
    await secondDevice.waitFor(t.join.chooseName);
    await secondDevice.waitFor(t.join.nameTaken);
    const disabled = await secondDevice.page.evaluate(
      (name) => [...document.querySelectorAll<HTMLButtonElement>('.join__choice')].find((choice) => choice.innerText.includes(name))?.disabled,
      owner.name,
    );
    expect(disabled).toBe(false);
    await secondDevice.click(owner.name);
    await secondDevice.waitFor(t.join.admissionHintMoved);
    await world.admin.waitFor(t.session.admission.replacesOtherDevice);
    await admitWaitingDevice(world.admin);
    await secondDevice.waitFor(slideText(world.stageSlide));
    await world.student.waitFor(t.join.chooseName);
  });

  it('the name moves back when the first device asks again and the second is sent to the name picker', async () => {
    await world.student.click(world.roster[0].name);
    await world.student.waitFor(t.join.admissionTitle);
    await world.admin.waitFor(t.session.admission.replacesOtherDevice);
    await admitWaitingDevice(world.admin);
    await world.student.waitFor(slideText(world.stageSlide));
    await secondDevice.waitFor(t.join.chooseName);
    await secondDevice.waitFor(t.join.seatLost);
    await secondDevice.page.close();
  });

  it('a raised answer card lets in the device waiting under that name, with no tap', async () => {
    const owner = world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;
    cardDevice = await Device.open(world.browser, 'card device', world.joinUrl.replace(/[^/]+$/, owner.groupId), PHONE, world.errors);
    await cardDevice.click(owner.name);
    await cardDevice.waitFor(t.join.admissionTitle);
    await openAdmissionScanner(world.admin);
    await cardDevice.waitFor(slideText(world.stageSlide), 9000);
  });

  it('a girl let in by card has no button to leave, and when the teacher removes her she is told why and asks again', async () => {
    const owner = world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;
    expect(await cardDevice.has(t.join.changeName)).toBe(false);
    await removeAdmittedDevice(world.admin, owner.name);
    await cardDevice.waitFor(t.join.chooseName);
    await cardDevice.waitFor(t.join.seatLost);
    await cardDevice.click(owner.name);
    await cardDevice.waitFor(t.join.admissionTitle);
    await openAdmissionScanner(world.admin);
    await cardDevice.waitFor(slideText(world.stageSlide), 9000);
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitGone(t.scanner.admitHint);
  });

  it('a raised card never moves a name off the device that holds it, and the teacher\'s tap on the «بدلًا من جهاز آخر» row does', async () => {
    const owner = world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;
    const claimant = await Device.open(world.browser, 'claimant', world.joinUrl.replace(/[^/]+$/, owner.groupId), PHONE, world.errors);
    await claimant.click(owner.name);
    await claimant.waitFor(t.join.admissionTitle);
    await openAdmissionScanner(world.admin);
    await world.admin.waitFor(t.scanner.needsTap);
    await claimant.holds('the claimant still waiting while the card is in view', async () => (await claimant.has(t.join.admissionTitle)) && (await cardDevice.has(slideText(world.stageSlide))), 4000);
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitGone(t.scanner.admitHint);
    await world.admin.waitFor(t.session.admission.replacesOtherDevice);
    await admitWaitingDevice(world.admin);
    await claimant.waitFor(slideText(world.stageSlide));
    await cardDevice.waitFor(t.join.chooseName);
    await cardDevice.waitFor(t.join.seatLost);
    await claimant.page.close();
    await removeAdmittedDevice(world.admin, owner.name);
    await cardDevice.click(owner.name);
    await cardDevice.waitFor(t.join.admissionTitle);
    await openAdmissionScanner(world.admin);
    await cardDevice.waitFor(slideText(world.stageSlide), 9000);
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitGone(t.scanner.admitHint);
  });

  it('a device removed by the teacher can pick another group from its name picker', async () => {
    const owner = world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;
    const other = world.roster.find((student) => student.groupId !== owner.groupId)!;
    const names = await groupNames(world.admin);
    await removeAdmittedDevice(world.admin, owner.name);
    await cardDevice.waitFor(t.join.chooseName);
    await cardDevice.click(t.join.wrongGroup);
    await cardDevice.waitFor(t.home.join.chooseGroup);
    await cardDevice.click(names.get(other.groupId)!, '.join-group');
    await cardDevice.waitFor(t.join.groupLabel(names.get(other.groupId)!));
    await cardDevice.waitFor(other.name);
    await cardDevice.page.close();
  });

  it('«تغيير الاسم» on the waiting screen returns her to the name list with no notice, and the waiting count follows', async () => {
    const changer = await Device.open(world.browser, 'changer', world.joinUrl, PHONE, world.errors);
    await changer.click(t.join.sharedDevice);
    await changer.waitFor(t.join.admissionTitle);
    await world.admin.waitFor(t.session.admission.waitingCount(1));
    await changer.click(t.join.changeName);
    await changer.waitFor(t.join.chooseName);
    await changer.holds('the name list without the taken-out notice', async () => !(await changer.has(t.join.seatLost)));
    await world.admin.waitFor(t.session.admission.nobodyWaiting);
    await world.admin.waitGone(t.session.admission.waitingCount(1));
    await changer.page.close();
  });

  it('a shared device that was let in gives its seat up with the two-press «اختيار اسم» and returns to the name list with no notice', async () => {
    const shared = await Device.open(world.browser, 'shared back', world.joinUrl, PHONE, world.errors);
    await shared.click(t.join.sharedDevice);
    await shared.waitFor(t.join.admissionTitle);
    await admitWaitingDevice(world.admin);
    await shared.waitFor(slideText(world.stageSlide));
    expect(await world.student.has(t.join.pickName)).toBe(false);
    await shared.click(t.join.pickName);
    await shared.waitFor(t.common.confirm);
    expect(await shared.has(slideText(world.stageSlide))).toBe(true);
    await shared.click(t.common.confirm);
    await shared.waitFor(t.join.chooseName);
    await shared.holds('the name list without any notice', async () => !(await shared.has(t.join.seatLost)) && !(await shared.has(t.join.nameTakenByOther)));
    const sharedSeats = async () => (await world.admin.texts('.shell__panel details .admission__item')).filter((row) => row.includes(t.join.sharedDeviceLabel));
    await world.admin.until('the shared seat gone from the list of devices inside', async () => (await sharedSeats()).length === 0);
    await shared.page.close();
  });

  it('two devices waiting for one name show a request number that the teacher\'s rows repeat, and the one not let in is told another girl took the name', async () => {
    const owner = world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;
    const url = world.joinUrl.replace(/[^/]+$/, owner.groupId);
    const first = await Device.open(world.browser, 'asker one', url, PHONE, world.errors);
    await first.click(owner.name);
    await first.waitFor(t.join.admissionTitle);
    const second = await Device.open(world.browser, 'asker two', url, PHONE, world.errors);
    await second.click(owner.name);
    await second.waitFor(t.join.admissionTitle);
    const shownOn = async (device: Device) => numbersShown(await device.text(), t.join.requestNumber)?.[0] ?? null;
    await first.until('a request number', async () => (await shownOn(first)) !== null);
    await second.until('a request number', async () => (await shownOn(second)) !== null);
    const devices = [await shownOn(first), await shownOn(second)].sort();
    const rowNumbers = async () =>
      (await world.admin.texts('.admission__list li')).map((row) => numbersShown(row, t.session.admission.requestNumber)?.[0] ?? null).sort();
    await world.admin.until('both rows with the numbers the devices show', async () => JSON.stringify(await rowNumbers()) === JSON.stringify(devices));
    await admitWaitingDevice(world.admin);
    await first.waitFor(slideText(world.stageSlide));
    await second.waitFor(t.join.nameTakenByOther);
    await second.waitFor(t.join.chooseName);
    expect(await second.has(t.join.seatLost)).toBe(false);
    await removeAdmittedDevice(world.admin, owner.name);
    await first.page.close();
    await second.page.close();
  });

  it('one press on «إدخال الجميع» lets in every waiting device whose name nobody else holds', async () => {
    const sharedOne = await Device.open(world.browser, 'shared one', world.joinUrl, PHONE, world.errors);
    const sharedTwo = await Device.open(world.browser, 'shared two', world.joinUrl, PHONE, world.errors);
    for (const device of [sharedOne, sharedTwo]) {
      await device.click(t.join.sharedDevice);
      await device.waitFor(t.join.admissionTitle);
    }
    await world.admin.until('two waiting devices', async () => (await world.admin.texts('.admission__list li')).length === 2);
    await world.admin.waitFor(t.session.admission.waitingCount(2));
    const stageCount = '.session__stage .session__waiting';
    await world.admin.until('the waiting count on the stage', async () => (await world.admin.texts(stageCount)).includes(t.session.admission.waitingCount(2)));
    expect(await sharedOne.exists(stageCount)).toBe(false);
    await world.admin.click(t.session.admission.admitAll, '.shell__panel');
    await sharedOne.waitFor(slideText(world.stageSlide));
    await sharedTwo.waitFor(slideText(world.stageSlide));
    await world.admin.waitFor(t.session.admission.nobodyWaiting);
    await world.admin.until('the stage count gone', async () => !(await world.admin.exists(stageCount)));
    await sharedOne.page.close();
    await sharedTwo.page.close();
    for (let device = 0; device < 2; device += 1) await removeAdmittedDevice(world.admin, t.join.sharedDeviceLabel);
  });

  it('the student follows to the next slide', async () => {
    await presentUpTo(world, 1);
    await world.student.waitFor(slideText(1));
  });

  it('the teacher sees a live tally on the poll', async () => {
    await presentUpTo(world, SLIDE.poll);
    await world.student.waitFor(slideText(SLIDE.poll));
    await world.student.page.click('.slide-option');
    await world.admin.until('a tally of 1', async () => (await tallies(world.admin)).includes('1'));
  });

  it('revealing shows the verdict and explanation to the student and locks the question', async () => {
    await presentUpTo(world, SLIDE.firstQuestion);
    await world.student.waitFor(slideText(SLIDE.firstQuestion));
    await world.student.page.click('.slide-option');
    await world.admin.until('a tally of 1', async () => (await tallies(world.admin)).includes('1'));
    await world.admin.click(t.session.reveal);
    await world.student.until('the wrong-answer verdict', () => world.student.exists('.slide-verdict--wrong'));
    await world.student.waitFor(explanationOf(SLIDE.firstQuestion));
    const locked = await world.student.page.$eval('.slide-option', (option) => (option as HTMLButtonElement).disabled);
    expect(locked).toBe(true);
  });

  it('the student opens her own results on her device and hides them again', async () => {
    await world.student.click(t.join.myResults);
    await world.student.waitFor(t.board.myResults(world.roster[0].name));
    expect(await world.student.count('.board__result')).toBeGreaterThan(0);
    await world.student.click(t.board.hideMine);
    await world.student.waitGone(t.board.myResults(world.roster[0].name));
  });

  it('a group text answer reaches the presenter', async () => {
    await presentUpTo(world, SLIDE.groupText);
    await world.student.waitFor(slideText(SLIDE.groupText));
    await world.student.page.type('textarea', GROUP_ANSWER);
    await world.student.click(t.slides.view.send);
    const group = (await groupNames(world.admin)).get(world.roster[0].groupId) ?? '';
    await world.admin.until('the answer and its group on the wall', async () => (await world.admin.has(GROUP_ANSWER)) && (await world.admin.has(group)));
  });

  it('hold freezes the student screen', async () => {
    await world.admin.click(t.session.pacing.hold, '.shell__panel');
    await world.student.waitFor(t.join.holdTitle);
  });

  it('free pacing gives the student navigation', async () => {
    await world.admin.click(t.session.pacing.free, '.shell__panel');
    await world.student.waitFor(t.join.ownPace);
    expect(await world.student.exists('.slide-nav')).toBe(true);
    const counter = await world.student.texts('.slide-nav span');
    expect(counter).toEqual([t.common.slideOf(world.stageSlide + 1, SAMPLE.slides.length)]);
    expect(counter[0]).not.toContain('/');
  });

  it('a pinned group stays while the teacher moves on', async () => {
    await world.admin.click(t.session.pacing.pinned, '.shell__panel');
    await presentUpTo(world, SLIDE.aiClaim);
    await world.student.holds('the student staying on the pinned slide', () => world.student.has(slideText(SLIDE.groupText)));
  });

  it('follow brings the student back to the teacher', async () => {
    await world.admin.click(t.session.pacing.follow, '.shell__panel');
    await world.student.waitFor(slideText(SLIDE.aiClaim));
  });
}
