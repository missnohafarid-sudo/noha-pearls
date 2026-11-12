import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { SECOND_CLASS, groupNames, openRunningClass } from '../actions';
import { Device } from '../device';
import { SAMPLE, SLIDE } from '../sample';
import type { World } from '../world';
import { CAMERA_CARD_NUMBER } from '../world';

const VISITOR_WIDTH = { width: 1100, height: 700 };

const resultsRows = (visitor: Device) => visitor.texts('.board__result');
const closingRow = async (visitor: Device) => (await resultsRows(visitor)).find((row) => row.includes(SAMPLE.slides[SLIDE.closing].title)) ?? '';

/** A visitor sees group totals only, and her own results once her card is shown. */
export function visitorBoardSteps(world: World): void {
  const owner = () => world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;

  it('admin pages do not exist for a visitor', async () => {
    world.visitor = await Device.open(world.browser, 'visitor', new URL('#/session', world.baseUrl).href, VISITOR_WIDTH, world.errors);
    await world.visitor.waitFor(t.common.notFoundTitle);
  });

  it('the visitor board shows no student name', async () => {
    await world.visitor.goto('#/board');
    await world.visitor.waitFor(t.board.leaderboard);
    const shown = await world.visitor.text();
    const leaked = world.roster.filter((student) => shown.includes(student.name) || shown.includes(`${student.name.split(' ')[0]} `));
    expect(leaked).toEqual([]);
  });

  it('showing card #2 reveals her own results', async () => {
    await world.visitor.click(t.board.showMine);
    await world.visitor.until('the camera to be live', () => world.visitor.page.evaluate(() => (document.querySelector('video')?.videoWidth ?? 0) > 0), 5000);
    await world.visitor.waitFor(t.board.myResults(owner().name), 9000);
    expect(await world.visitor.count('.board__result')).toBeGreaterThan(0);
  });

  it('an unrevealed result shows no right or wrong', async () => {
    const row = await closingRow(world.visitor);
    expect(row).toContain(t.board.verdict.pending);
    expect(row).not.toContain(t.board.verdict.correct);
    expect(row).not.toContain(t.board.verdict.wrong);
  });

  it('a revealed result shows right or wrong', async () => {
    await openRunningClass(world.admin, world.firstClassCode);
    await world.admin.click(t.session.reveal);
    await world.visitor.until('a verdict on the closing question', async () => {
      const row = await closingRow(world.visitor);
      return row.includes(t.board.verdict.correct) || row.includes(t.board.verdict.wrong);
    });
  });

  it('hiding removes her results', async () => {
    await world.visitor.click(t.board.hideMine);
    await world.visitor.waitGone(t.board.myResults(owner().name));
    expect(await world.visitor.count('.board__result')).toBe(0);
  });

  it('the visitor home shows the live banner and no unpublished lesson', async () => {
    await world.visitor.goto('#/');
    await world.visitor.waitFor(t.home.liveNowVisitor);
    expect(await world.visitor.has('Lesson imported by the walkthrough')).toBe(false);
  });

  it('the visitor home names every teacher of the list, in its order', async () => {
    await world.visitor.waitFor(t.home.teachersLine([world.firstTeacherName, SECOND_CLASS.teacherName]));
  });

  it('a wrong session code is refused', async () => {
    await world.visitor.fill('.join-code input', 'ZZZZZZ');
    await world.visitor.click(t.home.join.submit);
    await world.visitor.waitFor(t.home.join.wrongCode);
  });

  it('the real code in lower case offers the groups, and a group opens the join page', async () => {
    const code = world.joinUrl.split('/').at(-2)!;
    await world.visitor.fill('.join-code input', code.toLowerCase());
    await world.visitor.click(t.home.join.submit);
    await world.visitor.waitFor(t.home.join.chooseGroup);
    const names = await groupNames(world.admin);
    await world.visitor.click(names.get(world.roster[0].groupId)!, '.join-group');
    await world.visitor.waitFor(t.join.chooseName);
    await world.visitor.goto('#/');
  });
}
