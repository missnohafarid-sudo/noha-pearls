import { expect, it } from 'vitest';
import type { Answer, ClassRecord, Group, Lesson, LessonFolder, Participant, Reward, RetentionSettings, SchoolClass, Session, SessionRoster, SiteContent, Student, Teacher } from '../../src/domain/models';
import { DAY_MS, dateOf, inPeriod, periodAt, type CalendarDate } from '../../src/domain/periods';
import { nextClearingAt, nextClearingDay, rangeYears } from '../../src/domain/retention';
import { t } from '../../src/i18n';
import { monthName } from '../../src/i18n/months';
import { pickOption, startClass } from '../actions';
import { SAMPLE } from '../sample';
import { storedRecords, type World } from '../world';

const tr = t.retention;
const PANEL = '.shell__panel';
const MOVED_PAST_MS = 60_000;
const NOTICE_LEAD_MS = 3 * DAY_MS;
const END_OF_YEAR_AWAY_MS = 70 * DAY_MS;

const part = (group: string, name: string) => ({ ariaLabel: t.common.date.part(group, name) });

/** Runs in the page: moves its clock on by `offset`, on top of any move made before. Every way of making a date still works. */
function installMovedClock(offset: number): void {
  const RealDate = Date;
  class MovedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...(args as [number, number]));
    }

    static now(): number {
      return RealDate.now() + offset;
    }
  }
  window.Date = MovedDate as DateConstructor;
}

/** The school year and the clearing of class data: the tools on the results page, then the yearly clearing by itself, which is the last thing the walkthrough does. */
export function retentionSteps(world: World): void {
  const stored = <T>(collection: string) => storedRecords<T>(world.admin, collection);
  const settings = async () => (await stored<RetentionSettings>('retention'))[0];
  const sessions = () => stored<Session>('sessions');

  /** Today on the school's clock, read once by the first step and used by all the others. */
  let today: CalendarDate;
  /** How far the admin page's clock has been moved on. */
  let shifted = 0;

  const moveClockTo = async (at: number) => {
    const offset = at - Date.now();
    await world.admin.page.evaluateOnNewDocument(installMovedClock, offset - shifted);
    shifted = offset;
    await world.admin.page.reload({ waitUntil: 'networkidle0' });
    await world.admin.waitFor(t.shell.adminBadge);
  };

  /** Everything that must survive both kinds of clearing. */
  const byId = <T extends { id: string }>(docs: T[]) => docs.sort((a, b) => a.id.localeCompare(b.id));
  const keptThings = async () => ({
    lessons: byId(await stored<Lesson>('lessons')),
    folders: byId(await stored<LessonFolder>('folders')),
    teachers: byId(await stored<Teacher>('teachers')),
    site: byId(await stored<SiteContent>('site')),
  });

  /** What belongs to the classes with these ids, over every collection that holds class data. */
  const leftOf = async (ids: ReadonlySet<string>) => {
    const bySession = [...(await stored<Answer>('answers')), ...(await stored<Reward>('rewards')), ...(await stored<Participant>('participants'))].filter((doc) => ids.has(doc.sessionId));
    const ownIds = [...(await sessions()), ...(await stored<ClassRecord>('records')), ...(await stored<SessionRoster>('rosters'))].filter((doc) => ids.has(doc.id));
    return byId([...bySession, ...ownIds]);
  };

  const shownClass = async () => (await stored<SchoolClass>('classes')).find((schoolClass) => schoolClass.name === world.firstClassName)!;
  const untilPanelShows = (text: string) => world.admin.until(`the text "${text}" in the side panel`, async () => (await world.admin.texts(PANEL)).join(' ').includes(text));

  const openResults = async () => {
    await world.admin.goto('#/standings');
    await world.admin.waitFor(tr.title);
    await world.admin.until('the first class list shown', async () => (await world.admin.texts('main button[aria-pressed="true"]')).includes(world.firstClassName));
  };

  const pickDate = async (group: string, date: CalendarDate, withYear: boolean) => {
    if (withYear) await pickOption(world.admin, part(group, t.common.date.year), String(date.year));
    await pickOption(world.admin, part(group, t.common.date.month), monthName(date.month));
    await pickOption(world.admin, part(group, t.common.date.day), String(date.day));
  };

  it('the school-year section shows no clearing date until the box is ticked', async () => {
    today = dateOf(Date.now());
    await openResults();
    await untilPanelShows(tr.yearly.label);
    await untilPanelShows(tr.yearly.off);
    expect(await world.admin.has(tr.yearly.clears)).toBe(false);
    expect(await world.admin.count(`${PANEL} [aria-label="${t.common.date.part(tr.yearly.lastDay, t.common.date.month)}"]`)).toBe(0);
    expect(await stored('retention')).toEqual([]);
  });

  it('ticking it and choosing a day and month at least two months away stores the date and names the next clearing date', async () => {
    const end = dateOf(Date.now() + END_OF_YEAR_AWAY_MS);
    await world.admin.page.evaluate((panel) => document.querySelector<HTMLInputElement>(`${panel} input.checkbox__input`)?.click(), PANEL);
    await world.admin.until('the yearly clearing stored as on', async () => (await settings())?.yearEnd != null);
    await untilPanelShows(tr.yearly.clears);
    await untilPanelShows(tr.yearly.stays);
    await pickDate(tr.yearly.lastDay, end, false);
    await world.admin.until('the chosen day stored', async () => {
      const { yearEnd } = (await settings())!;
      return yearEnd?.month === end.month && yearEnd.day === end.day;
    });
    const day = nextClearingDay((await settings())!)!;
    expect(day.month).toBe(end.month);
    expect(day.day).toBe(end.day);
    await untilPanelShows(tr.yearly.next(day));
    expect((await settings())!.lastClearedAt).toBeNull();
  });

  it('a date range in the earliest offered year says zero and deletes nothing', async () => {
    const before = await sessions();
    expect(before.some((session) => session.status === 'ended')).toBe(true);
    const earliest = { year: rangeYears(today).first, month: 1, day: 1 };
    await pickDate(tr.range.to, earliest, true);
    await pickDate(tr.range.from, earliest, true);
    await untilPanelShows(tr.range.none(world.firstClassName));
    expect(await world.admin.texts(`${PANEL} button`)).not.toContain(tr.range.remove);
    expect(byId(await sessions())).toEqual(byId(before));
  });

  it('a range up to today counts the ended classes of the shown class list, and leaves a running one of it out', async () => {
    const { id } = await shownClass();
    if (!(await sessions()).some((session) => session.classId === id && session.status === 'live')) {
      await world.admin.goto('#/');
      await world.admin.waitFor(SAMPLE.title);
      await world.admin.click(SAMPLE.title);
      await startClass(world.admin, world.firstClassName, world.firstTeacherName);
      await world.admin.waitFor(t.session.pacingTitle);
    }
    await openResults();
    const all = await sessions();
    const ofThisList = all.filter((session) => session.classId === id);
    const ended = ofThisList.filter((session) => session.status === 'ended');
    expect(ofThisList.some((session) => session.status === 'live' && dateOf(session.startedAt).year === today.year)).toBe(true);
    expect(ended.length).toBeGreaterThan(0);
    expect(ended.every((session) => dateOf(session.startedAt).year === today.year)).toBe(true);

    await pickDate(tr.range.from, { year: today.year, month: 1, day: 1 }, true);
    await pickDate(tr.range.to, today, true);
    await untilPanelShows(tr.range.found(world.firstClassName, ended.length));
    await untilPanelShows(tr.range.runningStay);
  });

  it('deleting them removes those classes with their answers, hearts and results, and the cumulative table no longer counts them; the running class, other class lists, lessons, folders and class lists remain', async () => {
    const { id } = await shownClass();
    const all = await sessions();
    const going = new Set(all.filter((session) => session.classId === id && session.status === 'ended').map((session) => session.id));
    const staying = all.filter((session) => !going.has(session.id));
    expect(staying.some((session) => session.classId === id && session.status === 'live')).toBe(true);
    expect(staying.some((session) => session.classId !== id)).toBe(true);
    const before = {
      kept: await keptThings(),
      classes: byId(await stored<SchoolClass>('classes')),
      groups: byId(await stored<Group>('groups')),
      students: byId(await stored<Student>('students')),
      stayingChildren: await leftOf(new Set(staying.map((session) => session.id))),
    };
    expect((await leftOf(going)).length).toBeGreaterThan(going.size);

    await world.admin.click(tr.range.remove, PANEL);
    await untilPanelShows(tr.range.consequence(world.firstClassName, going.size, { year: today.year, month: 1, day: 1 }, today));
    await world.admin.click(t.common.confirm, PANEL);
    await untilPanelShows(tr.range.removed(going.size));
    await world.admin.until('the focus on the line that says how many were deleted', () =>
      world.admin.page.evaluate((text) => document.activeElement?.getAttribute('role') === 'status' && (document.activeElement.textContent ?? '').includes(text), tr.range.removed(going.size)),
    );

    expect(await leftOf(going)).toEqual([]);
    expect(byId(await sessions())).toEqual(byId(staying));
    expect(await leftOf(new Set(staying.map((session) => session.id)))).toEqual(before.stayingChildren);
    expect(await keptThings()).toEqual(before.kept);
    expect(byId(await stored<SchoolClass>('classes'))).toEqual(before.classes);
    expect(byId(await stored<Group>('groups'))).toEqual(before.groups);
    expect(byId(await stored<Student>('students'))).toEqual(before.students);
    const records = await stored<ClassRecord>('records');
    const counted = records.filter((record) => record.classId === id && inPeriod(periodAt('week', Date.now()), record.startedAt)).length;
    await world.admin.waitFor(t.standings.classCount(counted));
  });

  it('a signed-out visitor cannot see the school-year section', async () => {
    await world.visitor.goto('#/standings');
    await world.visitor.waitFor(t.common.notFoundTitle);
    for (const hidden of [tr.title, tr.yearly.label, tr.range.from]) expect(await world.visitor.has(hidden)).toBe(false);
    await world.visitor.goto('#/');
    await world.visitor.waitFor(t.home.lessonsTitle);
    for (const hidden of [tr.title, tr.yearly.label, tr.range.from]) expect(await world.visitor.has(hidden)).toBe(false);
  });

  it('in the last week the home page tells the admin the date of the clearing, with a link to where it is changed', async () => {
    const armed = (await settings())!;
    const day = nextClearingDay(armed)!;
    await moveClockTo(nextClearingAt(armed)! - NOTICE_LEAD_MS);
    await world.admin.goto('#/');
    await world.admin.waitFor(t.home.lessonsTitle);
    await world.admin.waitFor(tr.notice(day));
    await world.admin.click(tr.toResults);
    await world.admin.until('the results page', async () => world.admin.page.url().includes('#/standings'));
    await world.admin.waitFor(tr.title);
    expect((await settings())!.lastClearedAt).toBeNull();
    expect((await stored('classes')).length).toBeGreaterThan(0);
  });

  it('when the school year ends the students\' data is deleted by itself, once, and everything else stays', async () => {
    const before = await keptThings();
    const armed = (await settings())!;
    const next = nextClearingAt(armed)!;
    expect(armed.lastClearedAt).toBeNull();
    expect((await stored('classes')).length).toBeGreaterThan(0);

    await moveClockTo(next + MOVED_PAST_MS);

    await world.admin.until('the clearing written down', async () => ((await settings())?.lastClearedAt ?? null) !== null);
    const cleared = (await settings())!;
    expect(cleared.lastClearedAt).toBeGreaterThanOrEqual(next);
    expect(cleared.yearEnd).toEqual(armed.yearEnd);
    for (const collection of ['sessions', 'records', 'rosters', 'participants', 'answers', 'rewards', 'classes', 'groups', 'students']) expect(await stored(collection)).toEqual([]);
    expect(await keptThings()).toEqual(before);
    await world.admin.waitFor(t.standings.noClass);
    expect(await world.admin.has(t.roster.classNotFound)).toBe(false);

    await world.admin.page.reload({ waitUntil: 'networkidle0' });
    await world.admin.waitFor(t.shell.adminBadge);
    await world.admin.waitFor(t.standings.noClass);
    expect(await settings()).toEqual(cleared);
    expect(await keptThings()).toEqual(before);
  });

  it('afterwards the home page says when the students\' data was deleted', async () => {
    const { lastClearedAt } = (await settings())!;
    await world.admin.goto('#/');
    await world.admin.waitFor(t.home.lessonsTitle);
    await world.admin.waitFor(tr.done(dateOf(lastClearedAt!)));
  });
}
