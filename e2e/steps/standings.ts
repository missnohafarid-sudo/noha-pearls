import { expect, it } from 'vitest';
import { inPeriod, periodAt, shiftPeriod, type Period } from '../../src/domain/periods';
import type { ClassRecord, Reward } from '../../src/domain/models';
import { roundToTenth } from '../../src/domain/scoring';
import { t } from '../../src/i18n';
import type { Device } from '../device';
import { storedRecords, type World } from '../world';

const PAGE = 'main';

interface Stored {
  id: string;
  name: string;
}

interface Expected {
  classes: number;
  attended: number;
  held: number;
  attendance: string;
  answered: string;
  points: string;
  hearts: number;
}

/** The cumulative results: what the ended class of the first class list came to, by week and by month, read back from what was stored. */
export function standingsSteps(world: World): void {
  const student = () => world.roster[0];

  /** What the kept records and the stored hearts say the page must show for her in this period. */
  const expected = async (period: Period): Promise<Expected> => {
    const [classes, students, records, rewards] = await Promise.all([
      storedRecords<Stored>(world.admin, 'classes'),
      storedRecords<Stored>(world.admin, 'students'),
      storedRecords<ClassRecord>(world.admin, 'records'),
      storedRecords<Reward>(world.admin, 'rewards'),
    ]);
    const classId = classes.find((schoolClass) => schoolClass.name === world.firstClassName)!.id;
    const herId = students.find((stored) => stored.name === student().name)!.id;
    const inside = records.filter((record) => record.classId === classId && inPeriod(period, record.startedAt));
    const hers = inside.flatMap((record) => record.students.filter((entry) => entry.studentId === herId));
    const ids = new Set(inside.map((record) => record.id));
    return {
      classes: inside.length,
      attended: hers.filter((entry) => entry.present).length,
      held: hers.length,
      attendance: t.common.attendedOf(hers.filter((entry) => entry.present).length, hers.length),
      answered: String(hers.reduce((sum, entry) => sum + entry.answered, 0)),
      points: String(hers.reduce((sum, entry) => sum + entry.points, 0)),
      hearts: rewards.filter((reward) => reward.target.kind === 'student' && reward.target.id === herId && ids.has(reward.sessionId)).length,
    };
  };

  /** What the kept records and the stored hearts say the groups' table must show: score, possible score and hearts per group name. */
  const expectedGroups = async (period: Period): Promise<Map<string, { score: string; hearts: number }>> => {
    const [classes, groups, records, rewards] = await Promise.all([
      storedRecords<Stored>(world.admin, 'classes'),
      storedRecords<Stored>(world.admin, 'groups'),
      storedRecords<ClassRecord>(world.admin, 'records'),
      storedRecords<Reward>(world.admin, 'rewards'),
    ]);
    const classId = classes.find((schoolClass) => schoolClass.name === world.firstClassName)!.id;
    const inside = records.filter((record) => record.classId === classId && inPeriod(period, record.startedAt));
    const result = new Map<string, { score: string; hearts: number }>();
    for (const { id: groupId, name } of groups) {
      const entries = inside.flatMap((record) => record.groups.filter((entry) => entry.groupId === groupId));
      if (entries.length === 0) continue;
      const hearts = inside.reduce((sum, record) => {
        const given = rewards.filter((reward) => reward.sessionId === record.id);
        const members = new Set(record.students.filter((entry) => entry.groupId === groupId).map((entry) => entry.studentId));
        return sum + given.filter((reward) => (reward.target.kind === 'group' ? reward.target.id === groupId : members.has(reward.target.id))).length;
      }, 0);
      result.set(name, {
        score: t.common.scoreOf(roundToTenth(entries.reduce((sum, entry) => sum + entry.score, 0)), entries.reduce((sum, entry) => sum + entry.max, 0)),
        hearts,
      });
    }
    return result;
  };

  const shownGroups = (device: Device) =>
    device.page.evaluate(() => [...document.querySelectorAll<HTMLTableRowElement>('main tbody tr')].map((row) => [...row.cells].map((cell) => cell.innerText.trim())));

  const expectGroupTable = async (device: Device, period: Period) => {
    const should = await expectedGroups(period);
    expect(should.size).toBeGreaterThan(0);
    await device.waitFor(t.standings.periodLabel(period));
    await device.until('the groups table with every group', async () => (await shownGroups(device)).length === should.size);
    for (const [name, score, hearts] of await shownGroups(device)) {
      expect(should.get(name)).toBeDefined();
      expect(score).toBe(should.get(name)!.score);
      expect(Number(/\d+/.exec(hearts)?.[0])).toBe(should.get(name)!.hearts);
    }
  };

  const herRow = () =>
    world.admin.page.evaluate(
      (wanted) => {
        const row = [...document.querySelectorAll<HTMLTableRowElement>('main tbody tr')].find((candidate) => candidate.cells[0]?.innerText.trim() === wanted);
        return row ? [...row.cells].map((cell) => cell.innerText.trim()) : null;
      },
      student().name,
    );

  const expectHerResults = async (period: Period) => {
    const should = await expected(period);
    expect(should.classes).toBeGreaterThan(0);
    await world.admin.waitFor(t.standings.classCount(should.classes));
    await world.admin.until('her row in the students table', async () => (await herRow()) !== null);
    const [, attendance, answered, points, hearts] = (await herRow())!;
    expect(attendance).toBe(should.attendance);
    expect(answered).toBe(should.answered);
    expect(points).toBe(should.points);
    expect(Number(/\d+/.exec(hearts)?.[0])).toBe(should.hearts);
    expect(should.hearts).toBeGreaterThan(0);
  };

  it('the teacher opens the cumulative results and this week shows what the ended class gave a student, hearts given after the end included', async () => {
    await world.admin.goto('#/monitor');
    await world.admin.click(t.shell.nav.standings, '.shell__nav');
    await world.admin.until('the first class list shown', async () => (await world.admin.texts('main button[aria-pressed="true"]')).includes(world.firstClassName));
    await world.admin.waitFor(t.standings.note);
    await expectHerResults(periodAt('week', Date.now()));
    expect(await world.admin.has(t.standings.empty)).toBe(false);
  });

  it('the month shows her too', async () => {
    await world.admin.click(t.standings.periodKind.month, PAGE);
    await expectHerResults(periodAt('month', Date.now()));
  });

  it('the previous week has no ended classes, and the next button brings back this week', async () => {
    await world.admin.click(t.standings.periodKind.week, PAGE);
    const current = periodAt('week', Date.now());
    expect((await expected(shiftPeriod(current, -1))).classes).toBe(0);
    await world.admin.click(t.common.previous, PAGE);
    await world.admin.waitFor(t.standings.empty);
    await world.admin.waitFor(t.standings.classCount(0));
    await world.admin.click(t.common.next, PAGE);
    await world.admin.waitGone(t.standings.empty);
    await expectHerResults(current);
    const nextDisabled = await world.admin.page.evaluate(
      (label) => [...document.querySelectorAll<HTMLButtonElement>('main button')].find((button) => button.innerText.trim() === label)?.disabled,
      t.common.next,
    );
    expect(nextDisabled).toBe(true);
  });

  it('a signed-out visitor opening the address gets "not found"', async () => {
    await world.visitor.goto('#/standings');
    await world.visitor.waitFor(t.common.notFoundTitle);
    expect(await world.visitor.has(t.standings.note)).toBe(false);
  });

  it('a signed-out visitor\'s board shows the groups\' cumulative table of the class, and the month keeps the same numbers', async () => {
    await world.visitor.goto(`#/board/${world.firstClassCode}`);
    await world.visitor.waitFor(t.standings.title);
    await expectGroupTable(world.visitor, periodAt('week', Date.now()));
    await world.visitor.click(t.standings.periodKind.month, PAGE);
    await expectGroupTable(world.visitor, periodAt('month', Date.now()));
    await world.visitor.click(t.standings.periodKind.week, PAGE);
    await world.visitor.waitFor(t.standings.periodLabel(periodAt('week', Date.now())));
  });

  it('the visitor\'s board shows no student, no student table and no one\'s own line', async () => {
    const shown = await world.visitor.text();
    expect(world.roster.filter((entry) => shown.includes(entry.name))).toEqual([]);
    for (const hidden of [t.standings.students.title, t.standings.students.unresponsive, t.standings.own.periodKind.week, t.standings.own.periodKind.month]) expect(shown).not.toContain(hidden);
    expect(await world.visitor.count('main thead th')).toBe(3);
  });

  it('the student\'s ended screen shows her own cumulative line for this week and this month, hearts given after the end included', async () => {
    for (const kind of ['week', 'month'] as const) {
      const should = await expected(periodAt(kind, Date.now()));
      const line = t.standings.own.line(t.standings.own.periodKind[kind], { classes: should.held, attended: should.attended, points: Number(should.points), hearts: should.hearts });
      await world.student.waitFor(line);
    }
    expect(await world.student.has(t.standings.students.unresponsive)).toBe(false);
  });
}
