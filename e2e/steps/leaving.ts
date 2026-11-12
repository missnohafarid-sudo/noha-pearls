import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { SECOND_CLASS, admitWaitingDevice, openRunningClass, sessionCodeIn } from '../actions';
import type { Device } from '../device';
import { SLIDE, slideText } from '../sample';
import { storedRecords, type World } from '../world';

interface StoredRoster {
  students: { id: string; name: string }[];
  present: string[] | null;
}

interface SecondClass {
  teacher: Device;
  code: string;
}

const CODE_FIELD = '.join-code input';

/** A student steps out to the home page without losing her place, joins another running class, and comes back to the first by its code alone. */
export function leavingSteps(world: World, second: () => SecondClass): void {
  const student = () => world.roster[0];

  const typeCode = async (code: string) => {
    await world.student.fill(CODE_FIELD, code);
    await world.student.click(t.home.join.submit);
  };
  const leaveToHome = async () => {
    await world.student.click(t.common.backHome);
    await world.student.waitFor(t.home.liveNowVisitor);
    expect(world.student.page.url().endsWith('#/')).toBe(true);
  };
  /** On the teacher's overview, opens the running class whose row holds this code. */
  const openFromList = async (code: string) => {
    await world.admin.waitFor(t.session.chooser.title);
    await world.admin.until(`the row of ${code} opened`, () =>
      world.admin.page.evaluate(
        (wanted, label) => {
          const row = [...document.querySelectorAll<HTMLElement>('.session-list__item')].find((item) => item.innerText.includes(wanted));
          const link = [...(row?.querySelectorAll<HTMLElement>('a, button') ?? [])].find((element) => element.innerText.includes(label));
          link?.click();
          return link !== undefined;
        },
        code,
        t.session.chooser.open.session,
      ),
    );
  };

  it('she leaves to the home page from her slide, and the teacher still has her inside the class and on the roll', async () => {
    await world.student.waitFor(slideText(world.stageSlide));
    await leaveToHome();
    await openRunningClass(world.admin, world.firstClassCode);
    await world.admin.until('her name in the list of devices inside the class', () =>
      world.admin.page.evaluate(
        (label, name) => {
          const inside = [...document.querySelectorAll<HTMLDetailsElement>('.shell__panel details')].find((details) => details.querySelector('summary')?.textContent?.includes(label));
          if (inside) inside.open = true;
          return [...(inside?.querySelectorAll<HTMLElement>('.admission__item') ?? [])].some((item) => item.innerText.includes(name));
        },
        t.session.admission.inside,
        student().name,
      ),
    );
    const rosters = await storedRecords<StoredRoster>(world.admin, 'rosters');
    const roster = rosters.find((candidate) => candidate.students.some((entry) => entry.name === student().name))!;
    const herId = roster.students.find((entry) => entry.name === student().name)!.id;
    expect(roster.present).toContain(herId);
    await world.admin.waitFor(t.session.admission.nobodyWaiting);
  });

  it('typing the code of the class on the home page puts her straight back on the slide, with no group, no name and no teacher', async () => {
    await typeCode(world.firstClassCode);
    await world.student.waitFor(slideText(world.stageSlide));
    expect(world.student.page.url()).toContain(`#/join/${world.firstClassCode}/`);
    expect(await world.student.has(t.join.chooseName)).toBe(false);
    expect(await world.student.has(t.join.admissionTitle)).toBe(false);
    await world.admin.holds('nobody waiting on the teacher\'s side', async () => !(await world.admin.has(t.session.admission.waitingCount(1))));
  });

  it('she leaves again and joins the other running class, where its teacher lets her in', async () => {
    const { teacher, code } = second();
    await leaveToHome();
    await typeCode(code);
    await world.student.waitFor(t.home.join.chooseGroup);
    await world.student.click(SECOND_CLASS.groupName, '.join-group');
    await world.student.click(SECOND_CLASS.studentName);
    await world.student.waitFor(t.join.admissionTitle);
    await openRunningClass(teacher, code);
    await admitWaitingDevice(teacher);
    await world.student.waitFor(slideText(SLIDE.opening));
    await world.student.waitGone(t.join.admissionTitle);
  });

  it('she leaves the other class and returns to the first by its code, straight onto its slide', async () => {
    await leaveToHome();
    await typeCode(world.firstClassCode);
    await world.student.waitFor(slideText(world.stageSlide));
    expect(world.student.page.url()).toContain(`#/join/${world.firstClassCode}/`);
    expect(await world.student.has(t.join.admissionTitle)).toBe(false);
  });

  it('the other class kept her seat too: its code takes her back there with no teacher, and she returns to the first once more', async () => {
    await leaveToHome();
    await typeCode(second().code);
    await world.student.waitFor(slideText(SLIDE.opening));
    expect(await world.student.has(t.join.admissionTitle)).toBe(false);
    await leaveToHome();
    await typeCode(world.firstClassCode);
    await world.student.waitFor(slideText(world.stageSlide));
  });

  it('from her running class the teacher reaches the list, opens the other running class and comes back, ending nothing', async () => {
    const { code } = second();
    await openRunningClass(world.admin, world.firstClassCode);
    await world.admin.click(t.session.allClasses, '.shell__panel');
    await openFromList(code);
    await world.admin.until('the other class open', async () => sessionCodeIn(world.admin) === code);
    await world.admin.waitFor(t.session.whose(SECOND_CLASS.className, SECOND_CLASS.teacherName));
    await world.admin.click(t.session.allClasses, '.shell__panel');
    await openFromList(world.firstClassCode);
    await world.admin.until('her own class open again', async () => sessionCodeIn(world.admin) === world.firstClassCode);
    await world.admin.waitFor(t.session.pacingTitle);
    await world.student.holds('her slide, with no closing message', async () => (await world.student.has(slideText(world.stageSlide))) && !(await world.student.has(t.join.ended)));
  });
}
