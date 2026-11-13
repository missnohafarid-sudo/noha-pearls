import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { openAdmissionScanner, openGroupsToday, openRunningClass, setPresentToday } from '../actions';
import { CAMERA_CARD_NUMBER, storedRecords, type World } from '../world';

interface StoredRoster {
  students: { id: string; name: string }[];
  present: string[] | null;
}

interface StoredAnswer {
  slideId: string;
}

interface StoredSession {
  lessonId: string;
  className: string;
  status: string;
  slideIndex: number;
}

/** The roll: who counts in the class, in the panel, the tally, the «طالبات الحصة» list, the roll-call scan and the monitor. */
export function attendanceSteps(world: World): void {
  const sure = () => world.roster[0];
  const silent = () => world.roster.find((student) => student.cardNumber !== CAMERA_CARD_NUMBER && student.name !== sure().name)!;
  const cameraStudent = () => world.roster.find((student) => student.cardNumber === CAMERA_CARD_NUMBER)!;

  const storedRoster = async () => {
    const rosters = await storedRecords<StoredRoster>(world.admin, 'rosters');
    return rosters.find((roster) => roster.students.some((student) => student.name === sure().name))!;
  };
  /** The students counted as here, read from the stored roll; the roll must exist. */
  const presentCount = async () => {
    const { present } = await storedRoster();
    expect(present).not.toBeNull();
    return present!.length;
  };
  const answeredOnClosing = async () => {
    const sessions = await storedRecords<StoredSession>(world.admin, 'sessions');
    const running = sessions.find((session) => session.status === 'live' && session.className === world.firstClassName)!;
    const lessons = await storedRecords<{ id: string; slides: { id: string }[] }>(world.admin, 'lessons');
    const slideId = lessons.find((lesson) => lesson.id === running.lessonId)!.slides[running.slideIndex].id;
    const answers = await storedRecords<StoredAnswer>(world.admin, 'answers');
    return answers.filter((answer) => answer.slideId === slideId).length;
  };
  const waitingNames = () =>
    world.admin.page.evaluate(() =>
      [...document.querySelectorAll('.pearl-panel .pearl-student')].filter((row) => row.querySelector('.pearl-mark--waiting')).map((row) => row.querySelector('.pearl-student__name')?.textContent ?? ''),
    );

  it('the devices let in put their students on the roll, and the panel counts them', async () => {
    await openRunningClass(world.admin, world.firstClassCode);
    const roster = await storedRoster();
    expect(roster.present).toEqual(expect.arrayContaining(roster.students.filter((s) => [sure().name, cameraStudent().name].includes(s.name)).map((s) => s.id)));
    await world.admin.waitFor(t.session.admission.present(await presentCount(), roster.students.length));
    expect(await world.admin.has(t.session.admission.noRollYet)).toBe(false);
  });

  it('the tally counts the answers of those who are here out of those who are here', async () => {
    await world.admin.waitFor(t.common.answeredCount(await answeredOnClosing(), await presentCount()));
  });

  it('the teacher sees who is here and has not answered, and a student device does not', async () => {
    const before = await presentCount();
    await openGroupsToday(world.admin);
    await setPresentToday(world.admin, silent().name, true);
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitFor(t.common.answeredCount(await answeredOnClosing(), before + 1));
    await world.admin.click(t.session.notAnswered);
    await world.admin.until('her name in the waiting list', async () => (await waitingNames()).includes(silent().name));
    expect(await waitingNames()).toEqual([silent().name]);
    await world.admin.click(t.common.close, '.pearl-panel');
    expect(await world.student.has(t.session.notAnswered)).toBe(false);
  });

  it('marking a student who answered absent drops her from the total and her answer from the count, and marks her on the monitor', async () => {
    const [before, answered] = [await presentCount(), await answeredOnClosing()];
    await openGroupsToday(world.admin);
    await setPresentToday(world.admin, sure().name, false);
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitFor(t.common.answeredCount(answered - 1, before - 1));
    await world.admin.waitFor(t.session.admission.present(before - 1, (await storedRoster()).students.length));
    await world.admin.goto('#/monitor');
    await world.admin.until('her mark on the monitor', async () => (await world.admin.texts('tbody tr')).some((row) => row.includes(sure().name) && row.includes(t.common.absent)));
  });

  it('marking her present again restores the total and takes the mark off the monitor', async () => {
    const [before, answered] = [await presentCount(), await answeredOnClosing()];
    await openRunningClass(world.admin, world.firstClassCode);
    await openGroupsToday(world.admin);
    await setPresentToday(world.admin, sure().name, true);
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitFor(t.common.answeredCount(answered, before + 1));
    await world.admin.goto('#/monitor');
    await world.admin.until('the mark gone from the monitor', async () => !(await world.admin.texts('tbody tr')).some((row) => row.includes(sure().name) && row.includes(t.common.absent)));
  });

  it('the roll-call scan marks a student present from her card alone, with no device of hers waiting', async () => {
    const { name } = cameraStudent();
    await openRunningClass(world.admin, world.firstClassCode);
    await openGroupsToday(world.admin);
    await setPresentToday(world.admin, name, false);
    await world.admin.page.keyboard.press('Escape');
    const before = await presentCount();
    await openAdmissionScanner(world.admin);
    const row = async () => (await world.admin.texts('.scanner__student-row')).find((item) => item.includes(name)) ?? '';
    await world.admin.until(`${name} marked present by her card`, async () => (await row()).includes(t.common.present), 9000);
    expect(await row()).not.toContain(t.scanner.needsTap);
    await world.admin.page.keyboard.press('Escape');
    await world.admin.waitGone(t.scanner.admitHint);
    await world.admin.waitFor(t.session.admission.present(before + 1, (await storedRoster()).students.length));
  });
}
