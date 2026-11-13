import type { KeyInput } from 'puppeteer';
import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { groupNames, moveStudentToday, numbersShown, openGroupsToday } from '../actions';
import { DESKTOP, type Device } from '../device';
import { readPearlPanel, shownTab, showTab, type Mark, type PanelGroup } from '../pearlPanelRead';
import { SAMPLE, SLIDE, slideText } from '../sample';
import { CAMERA_CARD_NUMBER, storedRecords, type World } from '../world';

const BAR = '.presenter__bar';
const TOGGLE = '.presenter__main .pearl-toggle';
const CORNER_SLACK = 24;
const PANEL = '.pearl-panel';
const STAGE = '.session__stage';
const FRAME = '.presenter__frame';
const CARD = '.presenter__content > .slide';
const TAB = `${PANEL} .pearl-tab`;
const BODY = `${PANEL} .pearl-panel__body`;
const LAPTOP = { width: 1280, height: 800 };
const SHORT = { width: DESKTOP.width, height: 520 };
const EIGHT = 8;
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

/** The part of the slide card on screen: the card's box cut to the box of the frame that scrolls it. */
const visibleCard = (device: Device): Promise<Box> =>
  device.page.evaluate(
    (card, frame) => {
      const [c, f] = [document.querySelector(card)!.getBoundingClientRect(), document.querySelector(frame)!.getBoundingClientRect()];
      const [left, right, top, bottom] = [Math.max(c.left, f.left), Math.min(c.right, f.right), Math.max(c.top, f.top), Math.min(c.bottom, f.bottom)];
      return { left, right, top, bottom, width: right - left };
    },
    CARD,
    FRAME,
  );

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

  /** What the panel should list for an individual question, from what is stored: who is on the roll and who answered. */
  const expectedIndividual = async (): Promise<PanelGroup[]> => {
    const [roster, answers] = [await storedRoster(), await storedAnswers()];
    return roster.groups.map((group) => {
      const students = roster.students
        .filter((student) => student.groupId === group.id)
        .map((student) => {
          const present = roster.present === null || roster.present.includes(student.id);
          const answered = answers.some((answer) => answer.subject.kind === 'student' && answer.subject.id === student.id);
          return { name: student.name, absent: !present, mark: (present ? (answered ? 'answered' : 'waiting') : null) as Mark };
        });
      return { name: group.name, mark: null, waiting: students.filter((student) => student.mark === 'waiting').map((student) => student.name), students };
    });
  };
  const groupOf = async (studentId: string) => {
    const roster = await storedRoster();
    return roster.groups.find((group) => group.id === roster.students.find((student) => student.id === studentId)!.groupId)!;
  };

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
  /** A real press on a tab, which is what a hand does, then the wait for it to be the shown one. */
  const pressTab = async (name: string) => {
    await press(admin(), TAB, { text: name });
    await admin().until(`the tab ${name} shown`, async () => (await shownTab(admin())) === name);
  };
  const panelAttributes = () =>
    admin().page.evaluate((tabs, panelBody) => {
      const all = [...document.querySelectorAll<HTMLElement>(tabs)];
      const body = document.querySelector<HTMLElement>(panelBody)!;
      const selected = all.find((tab) => tab.getAttribute('aria-selected') === 'true');
      return {
        list: document.querySelector('.pearl-tabs')?.getAttribute('role') ?? '',
        roles: all.map((tab) => tab.getAttribute('role')),
        labels: all.map((tab) => tab.innerText.trim()),
        selected: all.filter((tab) => tab.getAttribute('aria-selected') === 'true').length,
        selectedIndex: selected ? all.indexOf(selected) : -1,
        focusable: all.filter((tab) => tab.tabIndex === 0).length,
        panelRole: body.getAttribute('role'),
        panelLabelledBy: body.getAttribute('aria-labelledby') === (selected?.id ?? null),
        active: all.findIndex((tab) => tab === document.activeElement),
      };
    }, TAB, BODY);

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
  const insideCard = (pearl: Box, card: Box) => {
    expect(pearl.left).toBeGreaterThanOrEqual(card.left);
    expect(pearl.right).toBeLessThanOrEqual(card.right);
    expect(pearl.top).toBeGreaterThanOrEqual(card.top);
    expect(pearl.bottom).toBeLessThanOrEqual(card.bottom);
    expect(pearl.left - card.left).toBeLessThanOrEqual(CORNER_SLACK);
    expect(card.bottom - pearl.bottom).toBeLessThanOrEqual(CORNER_SLACK);
  };

  it('the pearl sits inside the white slide card at its bottom-left corner, the card keeps the stage\'s full width, the panel opens over the slide from the pearl without changing the slide, and the same button closes it', async () => {
    await admin().page.evaluate(() => window.scrollTo(0, 0));
    const [frame, card, cardBefore, scrollBefore, pearl] = [await mustBox(admin(), FRAME), await visibleCard(admin()), await mustBox(admin(), CARD), await scrolled(), await mustBox(admin(), TOGGLE)];
    expect(await admin().exists(`${BAR} .pearl-toggle`)).toBe(false);
    expect(frame.width - cardBefore.width).toBeLessThanOrEqual(CORNER_SLACK);
    insideCard(pearl, card);
    expect(await toggleState()).toBe('false');
    expect(await panelOpen()).toBe(false);
    await press(admin(), TOGGLE);
    await admin().until('the panel', panelOpen);
    expect(await toggleState()).toBe('true');
    await settled();
    const [panel, framed, cardOpen, pearlOpen] = [await mustBox(admin(), PANEL), await mustBox(admin(), FRAME), await mustBox(admin(), CARD), await mustBox(admin(), TOGGLE)];
    expect([cardOpen.left, cardOpen.right, cardOpen.top]).toEqual([cardBefore.left, cardBefore.right, cardBefore.top]);
    expect(Math.abs(panel.left - framed.left)).toBeLessThanOrEqual(CORNER_SLACK);
    expect(panel.bottom).toBeLessThanOrEqual(pearlOpen.top);
    expect(framed.bottom - panel.bottom).toBeLessThanOrEqual(pearlOpen.bottom - pearlOpen.top + 2 * CORNER_SLACK);
    expect(panel.right).toBeGreaterThan(framed.left);
    expect(panel.width / framed.width).toBeGreaterThan(0.5);
    expect(panel.width / framed.width).toBeLessThanOrEqual(0.7);
    expect(Math.abs(pearlOpen.left - pearl.left) + Math.abs(pearlOpen.bottom - pearl.bottom)).toBeLessThanOrEqual(2);
    expect(await admin().has(counter(world.stageSlide))).toBe(true);
    expect(await storedIndex()).toBe(world.stageSlide);
    await press(admin(), TOGGLE);
    await admin().until('the panel gone', async () => !(await panelOpen()));
    expect(await toggleState()).toBe('false');
    expect((await mustBox(admin(), CARD)).width).toBe(cardBefore.width);
    expect(await storedIndex()).toBe(world.stageSlide);
    expect(await scrolled()).toBe(scrollBefore);
  });

  it('while the slide scrolls inside a short stage the pearl stays at the card\'s visible bottom-left corner', async () => {
    await admin().page.setViewport(SHORT);
    const overflow = () => admin().page.$eval('.presenter__content', (content) => content.scrollHeight - content.clientHeight);
    await admin().until('the slide taller than the stage', async () => (await overflow()) > 0);
    const place = async () => {
      const [pearl, card] = [await mustBox(admin(), TOGGLE), await visibleCard(admin())];
      insideCard(pearl, card);
      return pearl;
    };
    const top = await place();
    await admin().page.$eval('.presenter__content', (content) => content.scrollTo(0, content.scrollHeight));
    const bottom = await place();
    expect(Math.abs(bottom.bottom - top.bottom) + Math.abs(bottom.left - top.left)).toBeLessThanOrEqual(1);
    const [content, lastLine] = [await mustBox(admin(), '.presenter__content'), await mustBox(admin(), `${CARD} > :last-child`)];
    expect(lastLine.bottom).toBeLessThanOrEqual(content.bottom - (bottom.bottom - bottom.top) / 2);
    await admin().page.$eval('.presenter__content', (scroller) => scroller.scrollTo(0, 0));
    await admin().page.setViewport(DESKTOP);
  });

  it('the panel has a row of tabs, «الكل» and one per group, and starts on «الكل»', async () => {
    await setPanel(true);
    const groups = (await storedRoster()).groups;
    const attributes = await panelAttributes();
    expect(attributes.list).toBe('tablist');
    expect(attributes.labels).toEqual([t.pearlPanel.all, ...groups.map((group) => group.name)]);
    expect(attributes.roles.every((role) => role === 'tab')).toBe(true);
    expect([attributes.selected, attributes.selectedIndex, attributes.focusable]).toEqual([1, 0, 1]);
    expect(attributes.panelRole).toBe('tabpanel');
    expect(attributes.panelLabelledBy).toBe(true);
    expect(await admin().exists(`${PANEL} .pearl-tab__dot`)).toBe(true);
  });

  it('the arrow keys move between the tabs, wrap round, and the tab page follows', async () => {
    await admin().page.focus(`${TAB}[aria-selected="true"]`);
    const total = (await storedRoster()).groups.length + 1;
    const pressKey = async (key: KeyInput, index: number) => {
      await admin().page.keyboard.press(key);
      await admin().until(`tab ${index} selected`, async () => (await panelAttributes()).selectedIndex === index);
      const attributes = await panelAttributes();
      expect([attributes.active, attributes.panelLabelledBy, attributes.focusable]).toEqual([index, true, 1]);
    };
    await pressKey('ArrowLeft', 1);
    await pressKey('ArrowLeft', 2);
    await pressKey('ArrowRight', 1);
    await pressKey('End', total - 1);
    await pressKey('ArrowLeft', 0);
    await pressKey('ArrowRight', total - 1);
    await pressKey('Home', 0);
    await admin().until('«الكل» page shown', () => admin().exists(`${PANEL} .pearl-overview`));
  });

  it('«الكل» lists every group with the names of those who have not answered, and each group\'s tab lists all its students in card order', async () => {
    await setPanel(true);
    const expected = await expectedIndividual();
    expect((await readPearlPanel(admin())).map((group) => [group.name, group.waiting, group.students.map((student) => student.name)])).toEqual(
      expected.map((group) => [group.name, group.waiting, group.students.map((student) => student.name)]),
    );
    expect(expected.flatMap((group) => group.students).length).toBeGreaterThanOrEqual(12);
    expect(await admin().exists(`${PANEL} .pearl-overview .pearl-student`)).toBe(false);
  });

  it('on an individual question the panel marks who answered and who did not, absent students are not listed as waiting, and its not-yet count equals the stage and the pearl button', async () => {
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
    const shown = await readPearlPanel(admin());
    expect(shown).toEqual(expected);
    expect(shown.flatMap((group) => group.waiting)).toHaveLength(waiting);
    const absent = new Set(expected.flatMap((group) => group.students).filter((student) => student.absent).map((student) => student.name));
    expect(shown.flatMap((group) => group.waiting).some((name) => absent.has(name))).toBe(false);
    await showTab(admin(), t.pearlPanel.all);
    for (const group of expected) {
      const present = group.students.filter((student) => student.mark !== null).length;
      const done = group.students.filter((student) => student.mark === 'answered').length;
      const card = (await admin().texts(`${PANEL} .pearl-card`)).find((text) => text.includes(group.name))!;
      expect(card.includes(t.common.answeredCount(done, present))).toBe(present > 0);
    }
    expect(await admin().exists(`${STAGE} .pearl-open`)).toBe(false);
  });

  it('pressing a group\'s name on «الكل» opens that group\'s tab, and its heart there gives a heart and stays on «الكل»', async () => {
    const [target, other] = [await lastGroup(), (await storedRoster()).groups[0]];
    await showTab(admin(), t.pearlPanel.all);
    const before = await storedHearts('group', other.id);
    await giveHeart(other.name);
    await admin().until('the heart stored', async () => (await storedHearts('group', other.id)).byTeacher === before.byTeacher + 1);
    expect(await shownTab(admin())).toBe(t.pearlPanel.all);
    await press(admin(), `${PANEL} .pearl-card__open`, { text: target.name });
    await admin().until('her group\'s tab', async () => (await shownTab(admin())) === target.name);
    expect(await admin().exists(`${PANEL} .pearl-group[aria-label="${target.name}"]`)).toBe(true);
    await pressTab(t.pearlPanel.all);
  });

  it('a heart given to a student in her group\'s tab is stored as the teacher\'s heart and her count rises there', async () => {
    const student = await lastStudent();
    await pressTab((await groupOf(student.id)).name);
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

  it('a heart given to a group in its own tab is stored for the group, the count rises there and on «الكل»', async () => {
    const group = await lastGroup();
    await pressTab(group.name);
    const [before, shownBefore] = [await storedHearts('group', group.id), await heartsShown(group.name)];
    await giveHeart(group.name);
    await admin().until('the group count rising', async () => (await heartsShown(group.name)) === shownBefore + 1);
    expect(await storedHearts('group', group.id)).toEqual({ all: before.all + 1, byTeacher: before.byTeacher + 1 });
    await giveHeart(group.name);
    await admin().until('the group count rising again', async () => (await heartsShown(group.name)) === shownBefore + 2);
    expect((await storedHearts('group', group.id)).byTeacher).toBe(before.byTeacher + 2);
    await pressTab(t.pearlPanel.all);
    await admin().until('the same count on «الكل»', async () => (await heartsShown(group.name)) === shownBefore + 2);
  });

  it('on a group question «الكل» says which groups have answered, and the students carry no mark', async () => {
    await goTo(t.common.previous, SLIDE.groupText);
    await admin().waitFor(slideText(SLIDE.groupText));
    const [roster, answers] = [await storedRoster(), await storedAnswers()];
    const answeredGroups = new Set(answers.filter((answer) => answer.subject.kind === 'group').map((answer) => answer.subject.id));
    expect(answeredGroups.size).toBeGreaterThan(0);
    const owner = roster.groups.find((group) => roster.students.some((student) => student.groupId === group.id && student.name === world.roster[0].name))!;
    await admin().until('the group marks', async () => (await readPearlPanel(admin())).some((group) => group.mark !== null));
    const shown = await readPearlPanel(admin());
    expect(shown.find((group) => group.name === owner.name)?.mark).toBe('answered');
    expect(shown.filter((group) => group.mark === 'answered')).toHaveLength(answeredGroups.size);
    expect(shown.every((group) => group.waiting.length === 0)).toBe(true);
    expect(shown.flatMap((group) => group.students).every((student) => student.mark === null)).toBe(true);
    expect(shown.flatMap((group) => group.students).some((student) => student.absent)).toBe(true);
    const marked = shown.filter((group) => group.mark !== null).length;
    await admin().waitFor(t.common.answeredCount(answeredGroups.size, marked));
    expect(await countOnToggle()).toBe(marked - answeredGroups.size);
  });

  it('the panel stays open across next and previous and the marks follow the slide', async () => {
    await goTo(t.common.next, SLIDE.aiClaim);
    expect(await panelOpen()).toBe(true);
    await admin().until('the students marked again', async () => {
      const shown = await readPearlPanel(admin());
      return shown.every((group) => group.mark === null) && shown.some((group) => group.students.some((student) => student.mark !== null));
    });
    expect(await readPearlPanel(admin())).toEqual(await expectedIndividual());
    await goTo(t.common.previous, SLIDE.groupText);
    expect(await panelOpen()).toBe(true);
    await admin().until('the groups marked again', async () => (await readPearlPanel(admin())).some((group) => group.mark !== null));
    await goTo(t.common.next, SLIDE.aiClaim);
    expect(await panelOpen()).toBe(true);
    expect(await toggleState()).toBe('true');
  });

  it('the chosen tab stays while the slide changes and while the panel is closed and opened again, and the stage button opens the panel on «الكل»', async () => {
    const group = await lastGroup();
    await pressTab(group.name);
    await goTo(t.common.previous, SLIDE.groupText);
    expect(await shownTab(admin())).toBe(group.name);
    await goTo(t.common.next, SLIDE.aiClaim);
    expect(await shownTab(admin())).toBe(group.name);
    await setPanel(false);
    await setPanel(true);
    expect(await shownTab(admin())).toBe(group.name);
    await setPanel(false);
    await press(admin(), `${STAGE} .pearl-open`);
    await admin().until('the panel', panelOpen);
    expect(await shownTab(admin())).toBe(t.pearlPanel.all);
    await admin().until('«الكل» page shown', () => admin().exists(`${PANEL} .pearl-overview`));
  });

  it('a group of eight students shows all eight in its tab, in columns, without the panel scrolling at 1280 by 800', async () => {
    await admin().page.setViewport(LAPTOP);
    const [roster, names, target] = [await storedRoster(), await groupNames(admin()), await lastGroup()];
    const home = new Map(roster.students.map((student) => [student.name, names.get(student.groupId)!]));
    const inTarget = roster.students.filter((student) => student.groupId === target.id).length;
    const movers = roster.students.filter((student) => student.groupId !== target.id && student.cardNumber !== CAMERA_CARD_NUMBER && student.name !== world.roster[0].name).slice(0, EIGHT - inTarget);
    expect(movers).toHaveLength(EIGHT - inTarget);
    const groupsOf = async () => new Map((await storedRoster()).students.map((student) => [student.name, student.groupId]));
    const regroup = async (to: (name: string) => string, done: (id: string, name: string) => boolean) => {
      await openGroupsToday(admin());
      for (const student of movers) await moveStudentToday(admin(), student.name, to(student.name));
      await admin().page.keyboard.press('Escape');
      await admin().until('the students in their groups', async () => [...(await groupsOf())].filter(([name]) => movers.some((mover) => mover.name === name)).every(([name, id]) => done(id, name)));
    };
    await regroup(() => target.name, (id) => id === target.id);
    try {
      await setPanel(true);
      await showTab(admin(), target.name);
      await settled();
      const shown = (await readPearlPanel(admin())).find((group) => group.name === target.name)!;
      expect(shown.students).toHaveLength(EIGHT);
      await showTab(admin(), target.name);
      const layout = await admin().page.evaluate((body, rows) => {
        const area = document.querySelector<HTMLElement>(body)!;
        const lefts = new Set([...document.querySelectorAll<HTMLElement>(rows)].map((row) => Math.round(row.getBoundingClientRect().left)));
        const last = [...document.querySelectorAll<HTMLElement>(rows)].pop()!.getBoundingClientRect();
        return { overflow: area.scrollHeight - area.clientHeight, columns: lefts.size, lastInside: last.bottom <= area.getBoundingClientRect().bottom && last.top >= area.getBoundingClientRect().top };
      }, BODY, `${PANEL} .pearl-group .pearl-student`);
      expect(layout.overflow).toBeLessThanOrEqual(0);
      expect(layout.columns).toBeGreaterThanOrEqual(2);
      expect(layout.lastInside).toBe(true);
    } finally {
      await regroup((name) => home.get(name)!, (id, name) => id === roster.students.find((student) => student.name === name)!.groupId);
      await admin().page.setViewport(DESKTOP);
    }
    await setPanel(false);
  });

  it('in full screen the pearl is inside the slide card, opens the panel, a heart can be given there, and closing it leaves full screen untouched', async () => {
    await setPanel(false);
    await admin().page.bringToFront();
    await press(admin(), `${BAR} button`, { text: t.common.fullscreen });
    const inFullscreen = () => admin().page.evaluate(() => document.fullscreenElement?.classList.contains('presenter') === true);
    await admin().until('the presenter in full screen', inFullscreen);
    insideCard(await mustBox(admin(), TOGGLE), await visibleCard(admin()));
    await press(admin(), TOGGLE);
    await admin().until('the panel in full screen', panelOpen);
    expect(await admin().page.evaluate(() => document.fullscreenElement?.contains(document.querySelector('.pearl-panel')) === true)).toBe(true);
    const [panel, viewport] = [await mustBox(admin(), PANEL), await admin().page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))];
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(viewport.height);
    const student = await lastStudent();
    await pressTab((await groupOf(student.id)).name);
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

  it('at 600px the pearl is inside the card, the panel covers the slide, the presenting bar stays usable, and closing the panel shows the slide again', async () => {
    await admin().page.setViewport(NARROW);
    await admin().page.evaluate(() => window.scrollTo(0, 0));
    const scrollBefore = await scrolled();
    insideCard(await mustBox(admin(), TOGGLE), await visibleCard(admin()));
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
