import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { CHOICE_LETTERS, choiceLetter } from '../../src/i18n/common';
import { groupNames, presentUpTo, scannerRow } from '../actions';
import { EXPECTED_OPTION_INDEX } from '../cardVideo';
import { SLIDE } from '../sample';
import { CAMERA_CARD_NUMBER, type World } from '../world';
import { GROUP_ANSWER } from './liveClass';

const HEART = '❤';
const ANSWERED_ROW = new RegExp(`\\s[${CHOICE_LETTERS.join('')}](\\s|$)`);

const cameraStudent = (world: World) => world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;

/** Card scanning, then the teacher's other pages: monitor, board hearts, printed cards, roster. */
export function scanningSteps(world: World): void {
  it('the camera reads the answer card on an individual four-option question', async () => {
    await presentUpTo(world, SLIDE.closing);
    await world.admin.click(t.session.scan);
    const { name } = cameraStudent(world);
    await world.admin.until(`${name}'s card to be read`, async () => ANSWERED_ROW.test(await scannerRow(world.admin, name)), 9000);
    expect(await scannerRow(world.admin, name)).toContain(choiceLetter(EXPECTED_OPTION_INDEX));
  });

  it('the manual fallback records an answer', async () => {
    const other = world.roster.find((student) => student.cardNumber !== CAMERA_CARD_NUMBER)!;
    await world.admin.click(other.name, '.scanner');
    await world.admin.until(`${other.name}'s manual answer`, async () => (await scannerRow(world.admin, other.name)).includes(choiceLetter(0)));
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitGone(t.session.closeScan);
  });

  it('the monitor lists students with their answers', async () => {
    await world.admin.goto('#/monitor');
    await world.admin.waitFor(world.roster[0].name);
    await world.admin.waitFor(GROUP_ANSWER);
  });

  it('a heart from the teacher reaches the board', async () => {
    await world.admin.until('a heart button', () => world.admin.exists('.btn--heart'));
    await world.admin.page.$eval('.btn--heart', (button) => (button as HTMLButtonElement).click());
    await world.admin.goto('#/board');
    await world.admin.until('one heart on the board', async () => new RegExp(`${HEART}\\s*1`).test(await world.admin.text()));
  });

  it('a heart from a classmate reaches the board', async () => {
    await world.student.click(t.join.encourage);
    await world.student.page.$eval('details .btn--heart', (button) => (button as HTMLButtonElement).click());
    await world.admin.waitFor(t.common.rewardSource.peer);
  });

  it('the cards page draws one marker per student', async () => {
    await world.admin.goto('#/cards');
    await world.admin.waitFor(world.roster[0].name);
    await world.admin.until('one marker per student', async () => (await world.admin.count('.answer-card svg')) === world.roster.length);
  });

  it('the roster lists every group', async () => {
    await world.admin.goto('#/roster');
    const ofThisClass = new Set(world.roster.map((student) => student.groupId));
    for (const [id, name] of await groupNames(world.admin)) if (ofThisClass.has(id)) await world.admin.waitFor(name);
    await world.admin.click(world.roster[0].name);
  });
}
