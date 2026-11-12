import { expect, it } from 'vitest';
import { SPARE_INTERACTIONS } from '../../src/domain/engagement';
import { t } from '../../src/i18n';
import { changeMinimum, numbersShown, openRunningClass, setPresentOnMonitor, shownMinimum } from '../actions';
import { storedRecords, type World } from '../world';

interface StoredSession {
  lessonId: string;
  className: string;
  status: string;
}

interface StoredLesson {
  id: string;
  slides: { kind: string; scope?: string }[];
}

/** The minimum of interactions on the monitor, and who it flags as unresponsive. */
export function engagementSteps(world: World): void {
  const silent = () => world.roster[2];

  const possible = async () => {
    const sessions = await storedRecords<StoredSession>(world.admin, 'sessions');
    const running = sessions.find((session) => session.status === 'live' && session.className === world.firstClassName)!;
    const lessons = await storedRecords<StoredLesson>(world.admin, 'lessons');
    return lessons.find((lesson) => lesson.id === running.lessonId)!.slides.filter((slide) => slide.kind !== 'content' && slide.scope === 'individual').length;
  };
  const rowOf = async (name: string) => (await world.admin.texts('tbody tr')).find((row) => row.includes(name)) ?? '';
  const flagged = async () => (await rowOf(silent().name)).includes(t.common.unresponsive);

  it('the monitor shows the default minimum, all but the spare questions, beside the number of questions each student answered', async () => {
    await world.admin.goto('#/monitor');
    await world.admin.waitFor(t.monitor.minInteractions);
    const total = await possible();
    await world.admin.until('the default minimum', async () => (await shownMinimum(world.admin)) === Math.max(0, total - SPARE_INTERACTIONS));
    expect(numbersShown(await rowOf(silent().name), t.common.interactionsOf, 2)?.[1]).toBe(total);
  });

  it('the teacher lowers the minimum to zero, which flags nobody, and raises it to every question', async () => {
    const total = await possible();
    for (let shown = (await shownMinimum(world.admin))!; shown > 0; shown -= 1) await changeMinimum(world.admin, t.monitor.lowerMin, -1);
    await world.admin.until('nobody flagged at a minimum of zero', async () => !(await flagged()));
    for (let shown = (await shownMinimum(world.admin))!; shown < total; shown += 1) await changeMinimum(world.admin, t.monitor.raiseMin, 1);
    await world.admin.until('the minimum held at the number of questions', async () => (await shownMinimum(world.admin)) === total);
  });

  it('a present student who can no longer reach the minimum shows «غير متفاعلة», and marking her absent takes it off', async () => {
    await world.admin.until('her flag', flagged);
    await setPresentOnMonitor(world.admin, silent().name, false);
    await world.admin.until('her flag gone and her absence shown', async () => {
      const row = await rowOf(silent().name);
      return !row.includes(t.common.unresponsive) && row.includes(t.common.absent);
    });
    await setPresentOnMonitor(world.admin, silent().name, true);
    await world.admin.until('her flag back', flagged);
    await openRunningClass(world.admin, world.firstClassCode);
  });
}
