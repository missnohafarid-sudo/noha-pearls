import { it } from 'vitest';
import { t } from '../../src/i18n';
import { boardScore, groupNames } from '../actions';
import { Device, DESKTOP } from '../device';
import { SLIDE, correctIndexOf } from '../sample';
import type { World } from '../world';

/** A group's score on the board follows the teacher's reveal, never a student's own answer. */
export function scoringSteps(world: World): void {
  let board: Device;
  let group = '';
  let before = 0;

  it('a group score does not change when a student answers an unrevealed question correctly', async () => {
    board = await Device.open(world.browser, 'scoreboard', new URL(`#/board/${world.firstClassCode}`, world.baseUrl).href, DESKTOP, world.errors);
    group = (await groupNames(board)).get(world.roster[0].groupId) ?? '';
    await board.until('the ranking', () => board.exists('.board__rank'));
    before = await boardScore(board, group);

    await world.student.page.$$eval('.slide-option', (options, right) => (options[right] as HTMLButtonElement).click(), correctIndexOf(SLIDE.aiClaim));
    await world.admin.until('the answer in the tally', async () => (await world.admin.texts('.slide-option__tally b')).includes('1'));
    await board.holds(`the score of ${group} staying at ${before}`, async () => (await boardScore(board, group)) === before);
  });

  it('the group score rises once the teacher reveals the answer', async () => {
    await world.admin.click(t.session.reveal);
    await board.until(`the score of ${group} rising above ${before}`, async () => (await boardScore(board, group)) > before);
  });
}
