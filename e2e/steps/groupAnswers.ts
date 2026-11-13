import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { choiceLetter } from '../../src/i18n/common';
import { admitWaitingDevice, groupNames, numbersShown, openRunningClass, removeAdmittedDevice, scannerRow, setPresentOnMonitor } from '../actions';
import { Device, PHONE } from '../device';
import { readPearlPanel } from '../pearlPanelRead';
import { SAMPLE, SLIDE, slideText } from '../sample';
import { CAMERA_CARD_NUMBER, type World } from '../world';
import { answersOn, countedFor, expectedAnswered, expectedTally, groupScore, here, individualSlides, loadClass, maxScore, ownAnswer, sortedEntries, studentPoints, type Data, type Mark, type StoredStudent } from './groupAnswersExpected';

const TOGGLE = '.presenter__main .pearl-toggle';
const SHARED_TEXT = 'A shared device answering for its whole group.';
const OWN_TEXT = 'My own answer, which replaces the group one for me alone.';
const SHARED_EDIT = 'The shared device changed its text while she was typing.';
const DRAFT_TEXT = 'Her own draft, half written';
const GROUP_BLOCK = '.slide-answer--group';
const GROUP_QUESTION_TEXT = 'The shared device answering a group question.';
const EXIT_CARD = SAMPLE.slides.length - 1;
const POLL_OPTIONS = (SAMPLE.slides[SLIDE.poll].options ?? []).length;
const GROUP_POLL_OPTION = 1;

/**
 * A shared device answers individual questions for its group: its answer stands for every present student of the group who gave none of her own.
 *
 * What it leaves behind, on purpose: the poll (slide 3) is revealed, which no screen can undo; the shared device's answers on the poll, the
 * exit card and the group question, and her own answers on the poll and the exit card, stay stored, because a teacher has no way to delete an answer
 * of a group. Every later lane reads only the closing slide, the scores of the questions it answers itself and the roll, none of these three slides,
 * so the lane puts back what a screen can put back: the shared device and the classmate's device are sent out, and the roll is returned to what it was.
 * That roll holds only the students whose own devices were let in: the shared devices of the earlier lanes put her group on it too, so the lane first
 * takes her groupmates off it.
 */
export function groupAnswersSteps(world: World): void {
  let shared: Device;
  let covered: Device;
  let rollBefore: string[] = [];
  const owner = () => world.roster[0];

  const load = () => loadClass(world);
  const slideAt = async (index: number) => (await load()).slides[index];
  const myGroup = async () => (await load()).students.find((student) => student.name === owner().name)!.groupId;
  const me = (data: Data) => data.students.find((student) => student.name === owner().name)!;
  const groupmates = (data: Data) => data.students.filter((student) => student.groupId === me(data).groupId && student.id !== me(data).id && student.cardNumber !== CAMERA_CARD_NUMBER);
  /** The groupmate the teacher marks absent, and the one who holds a device of her own and is covered by the group's answers. */
  const absentOne = (data: Data) => groupmates(data)[0];
  const coveredOne = (data: Data) => groupmates(data)[1];
  const tallies = async () => (await world.admin.texts('.slide-option__tally b')).map(Number);
  const groupMembersHere = (data: Data) => data.students.filter((student) => student.groupId === me(data).groupId && here(data, student.id));
  const showOnStage = async (index: number) => {
    await openRunningClass(world.admin, world.firstClassCode);
    while (world.stageSlide !== index) {
      const forward = index > world.stageSlide;
      await world.admin.click(forward ? t.common.next : t.common.previous, '.slide-nav');
      world.stageSlide += forward ? 1 : -1;
      await world.admin.waitFor(t.common.slideOf(world.stageSlide + 1, SAMPLE.slides.length));
    }
    await world.student.waitFor(slideText(index));
    await shared.waitFor(slideText(index));
    if (covered) await covered.waitFor(slideText(index));
  };
  const shownAnswered = async () => numbersShown(await world.admin.text(), t.common.answeredCount, 2);
  const pressOption = (device: Device, index: number) => device.page.$$eval('.slide-option', (options, at) => (options[at] as HTMLButtonElement).click(), index);
  const panelMarks = async (): Promise<Record<string, Mark>> =>
    Object.fromEntries((await readPearlPanel(world.admin)).flatMap((group) => group.students).map((student) => [student.name, student.mark]));
  /** The monitor's rows: each cell's text, and how many of the row's marks name an answer as the group's. */
  const monitorRows = () =>
    world.admin.page.evaluate(
      (groupLabel) =>
        [...document.querySelectorAll('tbody tr')].map((row) => ({
          cells: [...row.querySelectorAll('td')].map((cell) => cell.innerText.trim()),
          marks: [...row.querySelectorAll('[aria-label]')].filter((mark) => (mark.getAttribute('aria-label') ?? '').includes(groupLabel)).length,
        })),
      t.common.groupAnswer,
    );
  const resultRowOn = async (device: Device, index: number) => {
    await device.click(t.join.myResults);
    const row = (await device.texts('.board__result')).find((text) => text.includes(SAMPLE.slides[index].title))!;
    await device.click(t.board.hideMine);
    return row;
  };

  it('a shared device of her group asks to come in, and the waiting list names it as the group\'s device that will answer for the whole group, before she lets it in', async () => {
    const first = await load();
    const mates = first.students.filter((student) => student.groupId === me(first).groupId && student.id !== me(first).id);
    expect(groupmates(first).length).toBeGreaterThanOrEqual(2);
    await world.admin.goto(`#/monitor/${world.firstClassCode}`);
    await world.admin.waitFor(mates[0].name);
    for (const mate of mates) await setPresentOnMonitor(world.admin, mate.name, false);
    await world.admin.until('her groupmates off the stored roll', async () => {
      const { present } = await load();
      return mates.every((mate) => present?.includes(mate.id) === false);
    });
    await openRunningClass(world.admin, world.firstClassCode);
    const data = await load();
    expect(data.present).toEqual(expect.arrayContaining([me(data).id]));
    rollBefore = [...data.present!];
    shared = await Device.open(world.browser, 'group shared device', world.joinUrl, PHONE, world.errors);
    await shared.click(t.join.sharedDevice);
    await shared.waitFor(t.join.admissionTitle);
    await openRunningClass(world.admin, world.firstClassCode);
    const group = (await groupNames(world.admin)).get(me(data).groupId)!;
    const waitingRow = async () => (await world.admin.texts('.admission__list .admission__item')).find((row) => row.includes(t.join.sharedDevice)) ?? '';
    await world.admin.until('the shared device in the waiting list', async () => (await waitingRow()) !== '');
    const row = await waitingRow();
    expect(row).toContain(group);
    expect(row).toContain(t.session.admission.answersForGroup);
    expect(await world.admin.has(t.session.admission.sharedNote)).toBe(true);
    expect((await load()).present).toEqual(rollBefore);
  });

  it('letting it in puts every student of its group on the roll, and the teacher can then mark one of them absent, who stays off it', async () => {
    await admitWaitingDevice(world.admin);
    await world.admin.until('her whole group on the stored roll', async () => {
      const data = await load();
      return data.students.filter((student) => student.groupId === me(data).groupId).every((student) => data.present?.includes(student.id));
    });
    const data = await load();
    expect(data.present!.filter((id) => !rollBefore.includes(id)).sort()).toEqual(data.students.filter((student) => student.groupId === me(data).groupId && !rollBefore.includes(student.id)).map((student) => student.id).sort());
    const absent = absentOne(data);
    await world.admin.goto(`#/monitor/${world.firstClassCode}`);
    await world.admin.waitFor(absent.name);
    await setPresentOnMonitor(world.admin, absent.name, false);
    await world.admin.until('her classmate off the stored roll', async () => (await load()).present?.includes(absent.id) === false);
    const after = await load();
    expect(here(after, me(after).id)).toBe(true);
    expect(here(after, coveredOne(after).id)).toBe(true);
    await openRunningClass(world.admin, world.firstClassCode);
  });

  it('a classmate of hers who is covered by the group opens her own device and is let in', async () => {
    const classmate = coveredOne(await load());
    covered = await Device.open(world.browser, 'covered classmate', world.joinUrl.replace(/[^/]+$/, classmate.groupId), PHONE, world.errors);
    await covered.click(classmate.name);
    await covered.waitFor(t.join.admissionTitle);
    await world.admin.until('her request in the waiting list', async () => (await world.admin.texts('.admission__list .admission__item')).some((row) => row.includes(classmate.name)));
    await admitWaitingDevice(world.admin);
    await covered.waitFor(slideText(world.stageSlide));
    expect(await world.admin.has(t.session.admission.sharedNote)).toBe(false);
  });

  it('on an individual question the shared device says it answers for every present student of the group who did not answer herself, and has no notice asking for a name', async () => {
    await showOnStage(EXIT_CARD);
    await shared.waitFor(t.join.answersForWholeGroup);
    expect(await shared.exists('textarea')).toBe(true);
    const data = await load();
    expect(data.slides[EXIT_CARD]).toMatchObject({ kind: 'text', scope: 'individual' });
    expect(groupMembersHere(data).length).toBeGreaterThan(0);
  });

  it('the shared device answers the individual text question and the stored answer belongs to the group', async () => {
    await shared.page.type('textarea', SHARED_TEXT);
    await shared.click(t.slides.view.send);
    const slide = await slideAt(EXIT_CARD);
    await world.admin.until('one stored answer of the group', async () => answersOn(await load(), slide.id).length === 1);
    expect(answersOn(await load(), slide.id)).toMatchObject([{ subject: { kind: 'group', id: await myGroup() }, value: SHARED_TEXT }]);
  });

  it('the teacher\'s count says every present student of that group answered, and the wall shows the group\'s answer once under the group\'s name', async () => {
    const data = await load();
    const [answered, present] = expectedAnswered(data, data.slides[EXIT_CARD].id);
    expect(answered).toBe(groupMembersHere(data).length);
    await world.admin.waitFor(t.common.answeredCount(answered, present));
    const group = (await groupNames(world.admin)).get(me(data).groupId)!;
    const wall = await world.admin.texts('.wall__item');
    expect(wall).toHaveLength(1);
    expect(wall[0]).toContain(group);
    expect(wall[0]).toContain(SHARED_TEXT);
  });

  it('the pearl panel marks the present students of that group as answered and the rest as waiting', async () => {
    await world.admin.page.$eval(TOGGLE, (button) => (button as HTMLButtonElement).click());
    const data = await load();
    const slide = data.slides[EXIT_CARD];
    const expected: Record<string, Mark> = Object.fromEntries(
      data.students.map((student): [string, Mark] => [student.name, here(data, student.id) ? (countedFor(data, slide.id, student) ? 'answered' : 'waiting') : null]),
    );
    await world.admin.until('the panel marks', async () => JSON.stringify(sortedEntries(await panelMarks())) === JSON.stringify(sortedEntries(expected)));
    expect(Object.values(expected)).toContain('answered');
    await world.admin.page.$eval(TOGGLE, (button) => (button as HTMLButtonElement).click());
    await world.admin.until('the panel closed', async () => !(await world.admin.exists('.pearl-panel')));
  });

  it('a named student of that group sees her group\'s answer as what counts for her, and in her own results it is named her group\'s answer', async () => {
    await world.student.waitFor(t.join.groupAnswered);
    expect(await world.student.texts('.slide-answer--group')).toEqual([expect.stringContaining(SHARED_TEXT)]);
    expect(await world.student.page.$eval('textarea', (field) => (field as HTMLTextAreaElement).value)).toBe('');
    const row = await resultRowOn(world.student, EXIT_CARD);
    expect(row).toContain(SHARED_TEXT);
    expect(row).toContain(t.common.yourGroupAnswer);
  });

  it('she answers differently herself and the answer is hers alone: the group\'s stays, the count stays, the wall shows both', async () => {
    const slide = await slideAt(EXIT_CARD);
    const before = expectedAnswered(await load(), slide.id);
    await world.admin.waitFor(t.common.answeredCount(...before));
    await world.student.fill('textarea', OWN_TEXT);
    await world.student.click(t.slides.view.send);
    await world.admin.until('her own stored answer', async () => answersOn(await load(), slide.id).length === 2);
    const data = await load();
    expect(answersOn(data, slide.id).map((answer) => [answer.subject.kind, answer.subject.id, answer.value]).sort()).toEqual(
      [['group', me(data).groupId, SHARED_TEXT], ['student', me(data).id, OWN_TEXT]].sort(),
    );
    await world.admin.until('both answers on the wall', async () => (await world.admin.texts('.wall__item')).length === 2);
    expect(expectedAnswered(data, slide.id)).toEqual(before);
    await world.admin.holds('the count staying where it was', async () => JSON.stringify(await shownAnswered()) === JSON.stringify(before));
    await world.student.waitGone(t.join.groupAnswered);
    const row = await resultRowOn(world.student, EXIT_CARD);
    expect(row).toContain(OWN_TEXT);
    expect(row).not.toContain(t.common.yourGroupAnswer);
    expect(await covered.has(t.join.groupAnswered)).toBe(true);
  });

  it('a covered student of the group keeps her own draft when the group\'s device changes its text: the group\'s text sits above her empty box, and sending her own removes it', async () => {
    const classmate = coveredOne(await load());
    const slide = await slideAt(EXIT_CARD);
    const boxValue = () => covered.page.$eval('textarea', (field) => (field as HTMLTextAreaElement).value);
    const groupBlock = async () => (await covered.texts(GROUP_BLOCK)).join('\n');
    await covered.until('the group\'s text above her box', async () => (await groupBlock()).includes(SHARED_TEXT));
    expect(await groupBlock()).toContain(t.common.yourGroupAnswer);
    expect(await boxValue()).toBe('');
    expect(await covered.has(t.slides.view.sent)).toBe(false);
    expect(await covered.has(t.slides.view.update)).toBe(false);
    await covered.page.type('textarea', DRAFT_TEXT);
    await shared.fill('textarea', SHARED_EDIT);
    await shared.click(t.slides.view.update);
    await world.admin.until('the group\'s changed text stored', async () => answersOn(await load(), slide.id).some((answer) => answer.subject.kind === 'group' && answer.value === SHARED_EDIT));
    await covered.until('the changed group text above her box', async () => (await groupBlock()).includes(SHARED_EDIT));
    expect(await boxValue()).toBe(DRAFT_TEXT);
    expect(await covered.has(t.slides.view.sent)).toBe(false);
    await covered.click(t.slides.view.send);
    await world.admin.until('her own answer stored', async () => answersOn(await load(), slide.id).some((answer) => answer.subject.kind === 'student' && answer.subject.id === classmate.id && answer.value === DRAFT_TEXT));
    await covered.until('the group block gone', async () => !(await covered.exists(GROUP_BLOCK)));
    expect(await boxValue()).toBe(DRAFT_TEXT);
    await covered.waitFor(t.slides.view.sent);
  });

  it('on a choice question the shared device\'s answer raises its option by the present students of the group who gave none of their own, and her own option stays hers', async () => {
    await showOnStage(SLIDE.poll);
    const slide = await slideAt(SLIDE.poll);
    await pressOption(shared, GROUP_POLL_OPTION);
    await world.admin.until('the shared answer stored', async () => answersOn(await load(), slide.id).some((answer) => answer.subject.kind === 'group'));
    const data = await load();
    expect(answersOn(data, slide.id).find((answer) => answer.subject.kind === 'group')).toMatchObject({ subject: { id: me(data).groupId }, value: GROUP_POLL_OPTION });
    const expected = expectedTally(data, slide.id, POLL_OPTIONS);
    const coveredCount = groupMembersHere(data).filter((student) => !ownAnswer(data, slide.id, student)).length;
    const ownVotes = data.students.filter((student) => here(data, student.id) && ownAnswer(data, slide.id, student)?.value === GROUP_POLL_OPTION).length;
    expect(expected[GROUP_POLL_OPTION]).toBe(ownVotes + coveredCount);
    await world.admin.until('the tally of each option', async () => JSON.stringify(await tallies()) === JSON.stringify(expected));
    await world.admin.waitFor(t.common.answeredCount(...expectedAnswered(data, slide.id)));
    expect(await world.student.has(t.join.groupAnswered)).toBe(false);
  });

  it('the card scanner lists a covered student with her group\'s option marked as the group\'s answer, and a tap gives her her own answer starting from that option', async () => {
    const slide = await slideAt(SLIDE.poll);
    const girl = coveredOne(await load());
    const optionOf = (data: Data) => ownAnswer(data, slide.id, girl)?.value;
    expect(optionOf(await load())).toBeUndefined();
    await world.admin.click(t.session.scan);
    const row = () => scannerRow(world.admin, girl.name);
    await world.admin.until('her row marked as her group\'s answer', async () => (await row()).includes(t.common.groupAnswer));
    expect(await row()).toContain(choiceLetter(GROUP_POLL_OPTION));
    await world.admin.click(girl.name, '.scanner');
    await world.admin.until('her own answer stored', async () => optionOf(await load()) !== undefined);
    expect(optionOf(await load())).toBe((GROUP_POLL_OPTION + 1) % POLL_OPTIONS);
    await world.admin.until('her row showing her own option', async () => (await row()).includes(choiceLetter((GROUP_POLL_OPTION + 1) % POLL_OPTIONS)) && !(await row()).includes(t.common.groupAnswer));
    await world.admin.click(girl.name, '.scanner');
    await world.admin.until('her own answer cleared again', async () => optionOf(await load()) === undefined);
    await world.admin.until('her group\'s answer back on her row', async () => (await row()).includes(t.common.groupAnswer));
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitGone(t.session.closeScan);
  });

  it('when she changes her own option only her count moves, from what counted for her to the new one', async () => {
    const slide = await slideAt(SLIDE.poll);
    const before = await load();
    const countedBefore = countedFor(before, slide.id, me(before));
    const beforeTally = await tallies();
    const target = [0, 2].find((option) => option !== countedBefore?.value)!;
    await pressOption(world.student, target);
    await world.admin.until('her own option stored', async () => ownAnswer(await load(), slide.id, me(before))?.value === target);
    const expected = expectedTally(await load(), slide.id, POLL_OPTIONS);
    await world.admin.until('the tally of each option', async () => JSON.stringify(await tallies()) === JSON.stringify(expected));
    expect(expected.map((count, option) => count - beforeTally[option])).toEqual(
      beforeTally.map((_, option) => (option === target ? 1 : 0) - (option === countedBefore?.value ? 1 : 0)),
    );
  });

  it('after the reveal the points of each student and the score of each group follow the answers that count for them, the monitor marks the cells the group gave, and a covered student\'s slide says it is her group\'s answer', async () => {
    await world.admin.click(t.session.reveal);
    await covered.until('her slide after the reveal still saying whose answer it is', async () => (await covered.has(t.join.groupAnswerKept)) && !(await covered.has(t.join.groupAnswered)));
    const mine = await resultRowOn(covered, SLIDE.poll);
    expect(mine).toContain(t.common.yourGroupAnswer);
    await world.admin.goto(`#/monitor/${world.firstClassCode}`);
    await world.admin.waitFor(t.monitor.minInteractions);
    const data = await load();
    const rows = await monitorRows();
    for (const student of data.students) {
      const row = rows.find((candidate) => candidate.cells[1].includes(student.name))!;
      const cells = individualSlides(data).map((slide) => countedFor(data, slide.id, student));
      expect(numbersShown(row.cells.at(-3)!, t.common.interactionsOf, 2)?.[0]).toBe(cells.filter((cell) => cell !== null).length);
      expect(row.marks).toBe(cells.filter((cell) => cell?.byGroup).length);
      expect(row.cells.at(-2)).toBe(String(studentPoints(data, student)));
    }
    expect(data.students.filter((student) => individualSlides(data).some((slide) => countedFor(data, slide.id, student)?.byGroup)).length).toBeGreaterThan(0);
    const cards = await world.admin.texts('section.card--tone');
    for (const group of data.groups) {
      const card = cards.find((text) => text.includes(group.name));
      if (card) expect(card).toContain(t.common.scoreOf(groupScore(data, group.id), maxScore(data)));
    }
  });

  it('on a group question the shared device behaves as before: one answer for the group, shown once on the wall', async () => {
    const groupSlide = SAMPLE.slides.findIndex((slide, index) => index > SLIDE.groupText && slide.scope === 'group');
    await showOnStage(groupSlide);
    await shared.page.type('textarea', GROUP_QUESTION_TEXT);
    await shared.click(t.slides.view.send);
    const slide = await slideAt(groupSlide);
    await world.admin.until('the group answer stored', async () => answersOn(await load(), slide.id).length === 1);
    expect(answersOn(await load(), slide.id)).toMatchObject([{ subject: { kind: 'group', id: await myGroup() }, value: GROUP_QUESTION_TEXT }]);
    expect(await shared.has(t.join.answersForWholeGroup)).toBe(false);
    await world.admin.until('the answer once on the wall', async () => (await world.admin.texts('.wall__item')).length === 1);
    expect(numbersShown(await world.admin.text(), t.common.answeredCount, 2)?.[0]).toBe(1);
  });

  it('both devices are sent out again and the roll is put back to what it was, so the later steps find the class as they expect', async () => {
    const data = await load();
    const classmate = coveredOne(data);
    await openRunningClass(world.admin, world.firstClassCode);
    await removeAdmittedDevice(world.admin, t.join.sharedDeviceLabel);
    await shared.waitFor(t.join.chooseName);
    await shared.page.close();
    await removeAdmittedDevice(world.admin, classmate.name);
    await covered.waitFor(t.join.chooseName);
    await covered.page.close();
    await world.admin.goto(`#/monitor/${world.firstClassCode}`);
    await world.admin.waitFor(classmate.name);
    const stored = await load();
    const changed: StoredStudent[] = stored.students.filter((student) => here(stored, student.id) !== rollBefore.includes(student.id));
    expect(changed.length).toBeGreaterThan(0);
    for (const student of changed) await setPresentOnMonitor(world.admin, student.name, rollBefore.includes(student.id));
    await world.admin.until('the stored roll as it was', async () => JSON.stringify([...((await load()).present ?? [])].sort()) === JSON.stringify([...rollBefore].sort()));
    await openRunningClass(world.admin, world.firstClassCode);
  });
}
