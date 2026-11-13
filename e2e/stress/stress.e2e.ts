import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { t } from '../../src/i18n';
import { admitWaitingDevice } from '../actions';
import { Device, DESKTOP, PHONE } from '../device';
import { SAMPLE, SLIDE, slideText } from '../sample';
import { launchBrowser, signInAsAdmin, openSignIn, storedRecords, type RosterEntry, type World } from '../world';

const ITERATIONS = Number(process.env.STRESS_ITERATIONS ?? 200);
const ONE_ACTION_MS = 4000;
const ALL_ITERATIONS_MS = 60 * 60 * 1000;

/**
 * Loops one cross-tab effect (the teacher holds and releases the students) and fails on any miss.
 * Not part of `npm run check`: run it with `npm run test:stress` (STRESS_ITERATIONS changes the count).
 */
describe('cross-tab stress', () => {
  const world = { baseUrl: inject('baseUrl'), errors: [] } as unknown as World;

  beforeAll(async () => {
    world.browser = await launchBrowser();
    world.admin = await Device.open(world.browser, 'teacher', world.baseUrl, DESKTOP, world.errors);
    await world.admin.waitFor(SAMPLE.title);
    const students = await storedRecords<RosterEntry>(world.admin, 'students');
    const first = students.sort((a, b) => a.cardNumber - b.cardNumber)[0];
    await openSignIn(world.admin);
    await signInAsAdmin(world.admin);
    await world.admin.click(SAMPLE.title);
    await world.admin.click(t.session.start);
    await world.admin.waitFor(t.session.pacingTitle);
    await world.admin.click(t.session.showJoinCodes);
    const joinLink = () => world.admin.page.evaluate((groupId) => [...document.querySelectorAll('a')].find((a) => a.href.includes('#/join/') && a.href.endsWith(`/${groupId}`))?.href ?? '', first.groupId);
    await world.admin.until('the join link', async () => (await joinLink()) !== '');
    const joinUrl = await joinLink();
    await world.admin.click(t.session.hideJoinCodes);
    world.student = await Device.open(world.browser, 'student', joinUrl, PHONE, world.errors);
    await world.student.click(first.name);
    await admitWaitingDevice(world.admin);
    await world.student.waitFor(slideText(SLIDE.opening));
  });

  afterAll(async () => {
    await world.browser?.close();
  });

  it(
    `${ITERATIONS} hold and follow changes all reach the student`,
    async () => {
      const misses: string[] = [];
      const change = async (label: string, button: string, studentHolds: boolean, round: number) => {
        await world.admin.click(button, '.shell__panel');
        try {
          await world.student.until(label, async () => (await world.student.has(t.join.holdTitle)) === studentHolds, ONE_ACTION_MS);
        } catch (error) {
          misses.push(`round ${round}: ${String(error)}`);
        }
      };
      for (let round = 1; round <= ITERATIONS; round++) {
        await change('the hold screen', t.session.pacing.hold, true, round);
        await change('the screen following the teacher again', t.session.pacing.follow, false, round);
      }
      expect(misses).toEqual([]);
    },
    ALL_ITERATIONS_MS,
  );
});
