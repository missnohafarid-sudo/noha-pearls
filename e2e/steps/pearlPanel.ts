import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { numbersShown } from '../actions';
import { DESKTOP, type Device } from '../device';
import { SAMPLE, SLIDE, slideText } from '../sample';
import { storedRecords, type World } from '../world';

const BAR = '.presenter__bar';
const TOGGLE = '.presenter__main .pearl-toggle';
const CORNER_SLACK = 24;
const PANEL = '.pearl-panel';
const STAGE = '.session__stage';
const NARROW = { width: 600, height: DESKTOP.height };

interface StoredSession {
  id: string;
  code: string;
  lessonId: string;
  slideIndex: number;
}

interface StoredRoster {
  id: string;
  groups: { id: string; name: string }[];
  students: { id: string; name: string; cardNumber: number; groupId: string }[];
  present: string[] | null;
}

interface StoredAnswer {
  sessionId: string;
  slideId: string;
  subject: { kind: string; id: string };
}

interface StoredReward {
  sessionId: string;
  target: { kind: string; id: string };
  source: string;
}

type Mark = 'answered' | 'waiting' | null;

interface Shown {
  name: string;
  mark: Mark;
  students: { name: string; absent: boolean; mark: Mark }[];
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

const boxOf = (device: Device, selector: string): Promise<Box | null> =>
  device.page.evaluate((wanted) => {
    const box = document.querySelector(wanted)?.getBoundingClientRect();
    return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width } : null;
  }, selector);

const mustBox = async (device: Device, selector: string): Promise<Box> => {
  const box = await boxOf(device, selector);
  if (!box) throw new Error(`Nothing on screen matches ${selector}.`);
  return box;
};

interface Match {
  text?: string;
  labelPrefix?: string;
}

/** Where the first element of `selector` (with this exact text, or whose label starts with this) is on screen, after bringing it into view inside its own scroller. */
const pointOf = (device: Device, selector: string, match: Match) =>
  device.page.evaluate(
    (wanted, text, prefix) => {
      const element = [...document.querySelectorAll<HTMLElement>(wanted)].find(
        (candidate) =>
          (text === undefined && prefix === undefined) ||
          (text !== undefined && candidate.innerText.trim() === text) ||
          (prefix !== undefined && (candidate.getAttribute('aria-label') ?? '').startsWith(prefix)),
      );
      if (!element) return null;
      element.scrollIntoView({ block: 'nearest' });
      const box = element.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, label: element.getAttribute('aria-label') ?? '' };
    },
    selector,
    match.text,
    match.labelPrefix,
  );

/** A real mouse press, which is what full screen needs and what a hand on a projector does. */
async function press(device: Device, selector: string, match: Match = {}): Promise<void> {
  await device.until(`${selector} on screen`, async () => (await pointOf(device, selector, match)) !== null);
  const point = (await pointOf(device, selector, match))!;
  await device.page.mouse.click(point.x, point.y);
}

/** The lane of the pearl panel: a class is running on the sample question slide, students are let in, the panel closed. */
export function pearlPanelSteps(world: World): void {
  const admin = () => world.admin;
  const slideId = async () => (await storedLesson()).slides[(await storedSession()).slideIndex].id;
  const storedLesson = async () => {
    const session = await storedSession();
    return (await storedRecords<{ id: string; slides: { id: string }[] }>(admin(), 'lessons')).find((lesson) => lesson.id === session.lessonId)!;
  };
  const storedSession = async () => (await storedRecords<StoredSession>(admin(), 'sessions')).find((session) => session.code === world.firstClassCode)!;
  const storedRoster = async () => {
    const session = await storedSession();
    const roster = (await storedRecords<StoredRoster>(admin(), 'rosters')).find((candidate) => candidate.id === session.id)!;
    const byCard = (a: { cardNumber: number }, b: { cardNumber: number }) => a.cardNumber - b.cardNumber;
    return { ...roster, students: [...roster.students].sort(byCard) };
  };
  const storedAnswers = async () => {
    const [session, slide] = [await storedSession(), await slideId()];
    return (await storedRecords<StoredAnswer>(admin(), 'answers')).filter((answer) => answer.sessionId === session.id && answer.slideId === slide);
  };
  const storedHearts = async (kind: string, id: string) => {
    const session = await storedSession();
    const given = (await storedRecords<StoredReward>(admin(), 'rewards')).filter((reward) => reward.sessionId === session.id && reward.target.kind === kind && reward.target.id === id);
    return { all: given.length, byTeacher: given.filter((reward) => reward.source === 'teacher').length };
  };

  const shownPanel = (): Promise<Shown[]> =>
    admin().page.evaluate(() => {
      const markOf = (element: Element | null): 'answered' | 'waiting' | null =>
        element?.classList.contains('pearl-mark--answered') ? 'answered' : element?.classList.contains('pearl-mark--waiting') ? 'waiting' : null;
      return [...document.querySelectorAll('.pearl-panel .pearl-card')].map((card) => ({
        name: card.querySelector('.pearl-card__name')?.textContent ?? '',
        mark: markOf(card.querySelector('.pearl-card__pearls .pearl-mark')),
        students: [...card.querySelectorAll('.pearl-student')].map((row) => ({
          name: row.querySelector('.pearl-student__name')?.textContent ?? '',
          absent: row.classList.contains('pearl-student--absent'),
          mark: markOf(row.querySelector('.pearl-mark')),
        })),
      }));
    });

  /** What the panel should list for an individual question, from what is stored: who is on the roll and who answered. */
  const expectedIndividual = async (): Promise<Shown[]> => {
    const [roster, answers, groupNames] = [await storedRoster(), await storedAnswers(), await namesOfGroups()];
    return roster.groups.map((group) => ({
      name: groupNames.get(group.id) ?? group.name,
      mark: null,
      students: roster.students
        .filter((student) => student.groupId === group.id)
        .map((student) => {
          const present = roster.present === null || roster.present.includes(student.id);
          const answered = answers.some((answer) => answer.subject.kind === 'student' && answer.subject.id === student.id);
          return { name: student.name, absent: !present, mark: present ? (answered ? 'answered' : 'waiting') : null };
        }),
    }));
  };
  const namesOfGroups = async () => new Map((await storedRoster()).groups.map((group) => [group.id, group.name]));

  const panelOpen = () => admin().exists(PANEL);
  const setPanel = async (open: boolean) => {
    if ((await panelOpen()) === open) return;
    await press(admin(), TOGGLE);
    await admin().until(`the panel ${open ? 'open' : 'closed'}`, async () => (await panelOpen()) === open);
  };
  /** The panel has finished growing from its corner, so its box is its real one. */
  const settled = () => admin().until('the panel at rest', () => admin().page.evaluate(() => document.querySelector('.pearl-panel')?.getAnimations().length === 0));
  const toggleState = () => admin().page.$eval(TOGGLE, (button) => button.getAttribute('aria-expanded'));
  const counter = (index: number) => t.common.slideOf(index + 1, SAMPLE.slides.length);
  const storedIndex = async () => (await storedSession()).slideIndex;
  const countOnToggle = async () => Number((await admin().texts(`${TOGGLE} .pearl-toggle__count`))[0] ?? 0);
  const countOnStage = async () => numbersShown((await admin().texts(`${STAGE} .pearl-open`))[0] ?? '', t.pearlPanel.notAnsweredCount)?.[0] ?? 0;
  const scrolled = () => admin().page.evaluate(() => window.scrollY);
  const goTo = async (label: string, index: number) => {
    await press(admin(), `${BAR} button`, { text: label });
    await admin().waitFor(counter(index));
    expect(await storedIndex()).toBe(index);
  };

  /** The hearts a person or group shows in the panel, and the press that gives one. */
  const heartsShown = async (owner: string) => {
    const prefix = t.common.heartsOf(owner, 0).replace(/0$/, '');
    const found = await pointOf(admin(), `${PANEL} button.btn--heart`, { labelPrefix: prefix });
    return found ? Number(found.label.slice(prefix.length)) : -1;
  };
  const giveHeart = async (owner: string) => {
    const prefix = t.common.heartsOf(owner, 0).replace(/0$/, '');
    await press(admin(), `${PANEL} button.btn--heart`, { labelPrefix: prefix });
  };

  const lastStudent = async () => {
    const roster = await storedRoster();
    const first = roster.students.find((student) => student.groupId === roster.groups[0].id)!;
    const target = roster.students[roster.students.length - 1];
    expect(target.id).not.toBe(first.id);
    return target;
  };
  const lastGroup = async () => {
    const roster = await storedRoster();
    const target = roster.groups[roster.groups.length - 1];
    expect(target.id).not.toBe(roster.groups[0].id);
    return target;
  };

  it('the pearl sits in the slide\'s end-side bottom corner, opens a panel over the slide from there without changing the slide or narrowing it, and the same button closes it', async () => {
    await admin().page.evaluate(() => window.scrollTo(0, 0));
    const [before, scrollBefore, pearl] = [await mustBox(admin(), STAGE), await scrolled(), await mustBox(admin(), TOGGLE)];
    expect(await admin().exists(`${BAR} .pearl-toggle`)).toBe(false);
    expect(Math.abs(pearl.left - before.left)).toBeLessThanOrEqual(CORNER_SLACK);
    expect(Math.abs(before.bottom - pearl.bottom)).toBeLessThanOrEqual(CORNER_SLACK);
    expect(await toggleState()).toBe('false');
    expect(await panelOpen()).toBe(false);
    await press(admin(), TOGGLE);
    await admin().until('the panel', panelOpen);
    expect(await toggleState()).toBe('true');
    await settled();
    const [panel, stage, pearlOpen] = [await mustBox(admin(), PANEL), await mustBox(admin(), STAGE), await mustBox(admin(), TOGGLE)];
    expect(stage.width).toBe(before.width);
    expect(Math.abs(panel.left - stage.left)).toBeLessThanOrEqual(CORNER_SLACK);
    expect(panel.bottom).toBeLessThanOrEqual(pearlOpen.top);
    expect(stage.bottom - panel.bottom).toBeLessThanOrEqual(pearlOpen.bottom - pearlOpen.top + 2 * CORNER_SLACK);
    expect(panel.right).toBeGreaterThan(stage.left);
    expect(panel.width / stage.width).toBeGreaterThan(0.5);
    expect(panel.width / stage.width).toBeLessThanOrEqual(0.7);
    expect(Math.abs(pearlOpen.left - pearl.left) + Math.abs(pearlOpen.bottom - pearl.bottom)).toBeLessThanOrEqual(2);
    expect(await admin().has(counter(world.stageSlide))).toBe(true);
    expect(await storedIndex()).toBe(world.stageSlide);
    await press(admin(), TOGGLE);
    await admin().until('the panel gone', async () => !(await panelOpen()));
    expect(await toggleState()).toBe('false');
    expect((await mustBox(admin(), STAGE)).width).toBe(before.width);
    expect(await storedIndex()).toBe(world.stageSlide);
    expect(await scrolled()).toBe(scrollBefore);
  });

  it('the panel lists every group with its students in card order', async () => {
    await setPanel(true);
    const expected = await expectedIndividual();
    expect((await shownPanel()).map((group) => [group.name, group.students.map((student) => student.name)])).toEqual(expected.map((group) => [group.name, group.students.map((student) => student.name)]));
    expect(expected.flatMap((group) => group.students).length).toBeGreaterThanOrEqual(12);
  });

  it('on an individual question the panel marks who answered and who did not, and its not-yet count equals the stage and the pearl button', async () => {
    await setPanel(false);
    const expected = await expectedIndividual();
    const waiting = expected.flatMap((group) => group.students).filter((student) => student.mark === 'waiting').length;
    const answered = expected.flatMap((group) => group.students).filter((student) => student.mark === 'answered').length;
    expect(waiting).toBeGreaterThan(0);
    expect(expected.flatMap((group) => group.students).some((student) => student.absent)).toBe(true);
    await admin().waitFor(t.common.answeredCount(answered, answered + waiting));
    expect(await countOnStage()).toBe(waiting);
    expect(await countOnToggle()).toBe(waiting);
    await setPanel(true);
    expect(await shownPanel()).toEqual(expected);
    const shown = (await shownPanel()).flatMap((group) => group.students);
    expect(shown.filter((student) => student.mark === 'waiting')).toHaveLength(waiting);
    expect(await admin().exists(`${STAGE} .pearl-open`)).toBe(false);
  });

  it('a heart given to a student in the panel is stored as the teacher\'s heart and her count rises there', async () => {
    const student = await lastStudent();
    const before = await storedHearts('student', student.id);
    const shownBefore = await heartsShown(student.name);
    expect(shownBefore).toBe(before.all);
    await giveHeart(student.name);
    await admin().until('her count rising', async () => (await heartsShown(student.name)) === shownBefore + 1);
    expect(await storedHearts('student', student.id)).toEqual({ all: before.all + 1, byTeacher: before.byTeacher + 1 });
    await giveHeart(student.name);
    await admin().until('her count rising again', async () => (await heartsShown(student.name)) === shownBefore + 2);
    expect((await storedHearts('student', student.id)).byTeacher).toBe(before.byTeacher + 2);
  });

  it('a heart given to a group in the panel is stored for the group and the group\'s count rises', async () => {
    const group = await lastGroup();
    const [before, shownBefore] = [await storedHearts('group', group.id), await heartsShown(group.name)];
    await giveHeart(group.name);
    await admin().until('the group count rising', async () => (await heartsShown(group.name)) === shownBefore + 1);
    expect(await storedHearts('group', group.id)).toEqual({ all: before.all + 1, byTeacher: before.byTeacher + 1 });
    await giveHeart(group.name);
    await admin().until('the group count rising again', async () => (await heartsShown(group.name)) === shownBefore + 2);
    expect((await storedHearts('group', group.id)).byTeacher).toBe(before.byTeacher + 2);
  });

  it('on a group question the panel says which groups have answered', async () => {
    await goTo(t.common.previous, SLIDE.groupText);
    await admin().waitFor(slideText(SLIDE.groupText));
    const [roster, answers] = [await storedRoster(), await storedAnswers()];
    const answeredGroups = new Set(answers.filter((answer) => answer.subject.kind === 'group').map((answer) => answer.subject.id));
    expect(answeredGroups.size).toBeGreaterThan(0);
    const owner = roster.groups.find((group) => roster.students.some((student) => student.groupId === group.id && student.name === world.roster[0].name))!;
    await admin().until('the group marks', async () => (await shownPanel()).some((group) => group.mark !== null));
    const shown = await shownPanel();
    expect(shown.find((group) => group.name === owner.name)?.mark).toBe('answered');
    expect(shown.filter((group) => group.mark === 'answered')).toHaveLength(answeredGroups.size);
    expect(shown.flatMap((group) => group.students).every((student) => student.mark === null)).toBe(true);
    expect(shown.flatMap((group) => group.students).some((student) => student.absent)).toBe(true);
    const marked = shown.filter((group) => group.mark !== null).length;
    await admin().waitFor(t.common.answeredCount(answeredGroups.size, marked));
    expect(await countOnToggle()).toBe(marked - answeredGroups.size);
  });

  it('the panel stays open across next and previous and the marks follow the slide', async () => {
    await goTo(t.common.next, SLIDE.aiClaim);
    expect(await panelOpen()).toBe(true);
    await admin().until('the students marked again', async () => (await shownPanel()).every((group) => group.mark === null) && (await shownPanel()).some((group) => group.students.some((student) => student.mark !== null)));
    expect(await shownPanel()).toEqual(await expectedIndividual());
    await goTo(t.common.previous, SLIDE.groupText);
    expect(await panelOpen()).toBe(true);
    await admin().until('the groups marked again', async () => (await shownPanel()).some((group) => group.mark !== null));
    await goTo(t.common.next, SLIDE.aiClaim);
    expect(await panelOpen()).toBe(true);
    expect(await toggleState()).toBe('true');
  });

  it('in full screen the pearl button opens the panel, a heart can be given there, and closing it leaves full screen untouched', async () => {
    await setPanel(false);
    await admin().page.bringToFront();
    await press(admin(), `${BAR} button`, { text: t.common.fullscreen });
    const inFullscreen = () => admin().page.evaluate(() => document.fullscreenElement?.classList.contains('presenter') === true);
    await admin().until('the presenter in full screen', inFullscreen);
    await press(admin(), TOGGLE);
    await admin().until('the panel in full screen', panelOpen);
    expect(await admin().page.evaluate(() => document.fullscreenElement?.contains(document.querySelector('.pearl-panel')) === true)).toBe(true);
    const [panel, viewport] = [await mustBox(admin(), PANEL), await admin().page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))];
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(viewport.height);
    const student = await lastStudent();
    const before = await storedHearts('student', student.id);
    await giveHeart(student.name);
    await admin().until('the heart stored', async () => (await storedHearts('student', student.id)).byTeacher === before.byTeacher + 1);
    await admin().until('her count shown', async () => (await heartsShown(student.name)) === before.all + 1);
    await press(admin(), `${PANEL} .pearl-panel__head button`);
    await admin().until('the panel closed', async () => !(await panelOpen()));
    expect(await inFullscreen()).toBe(true);
    await press(admin(), `${BAR} button`, { text: t.common.exitFullscreen });
    await admin().until('full screen left', () => admin().page.evaluate(() => document.fullscreenElement === null));
    expect(await storedIndex()).toBe(world.stageSlide);
  });

  it('at 600px the panel covers the slide, the presenting bar stays usable, and closing the panel shows the slide again', async () => {
    await admin().page.setViewport(NARROW);
    await admin().page.evaluate(() => window.scrollTo(0, 0));
    const scrollBefore = await scrolled();
    await press(admin(), TOGGLE);
    await admin().until('the panel', panelOpen);
    await settled();
    const [panel, stage, bar, pearl] = [await mustBox(admin(), PANEL), await mustBox(admin(), STAGE), await mustBox(admin(), BAR), await mustBox(admin(), TOGGLE)];
    expect(panel.left - stage.left).toBeLessThanOrEqual(CORNER_SLACK);
    expect(stage.right - panel.right).toBeLessThanOrEqual(CORNER_SLACK);
    expect(panel.width).toBeGreaterThan(stage.width * 0.9);
    expect(pearl.bottom).toBeLessThanOrEqual(bar.top);
    expect(panel.bottom).toBeLessThanOrEqual(bar.top + 1);
    expect(bar.bottom).toBeLessThanOrEqual(NARROW.height);
    await goTo(t.common.previous, SLIDE.groupText);
    await goTo(t.common.next, SLIDE.aiClaim);
    expect(await panelOpen()).toBe(true);
    await press(admin(), TOGGLE);
    await admin().until('the panel gone', async () => !(await panelOpen()));
    const shownStage = await mustBox(admin(), STAGE);
    expect(shownStage.width).toBeGreaterThan(NARROW.width * 0.8);
    expect(await admin().has(slideText(world.stageSlide))).toBe(true);
    expect(await scrolled()).toBe(scrollBefore);
    await admin().page.setViewport(DESKTOP);
  });
}
