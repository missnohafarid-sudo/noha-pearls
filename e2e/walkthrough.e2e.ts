import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Device, DESKTOP } from './device';
import { SAMPLE } from './sample';
import { attendanceSteps } from './steps/attendance';
import { classCardsSteps } from './steps/classCards';
import { classesSteps } from './steps/classes';
import { dialogsSteps } from './steps/dialogs';
import { endOfClassSteps } from './steps/endOfClass';
import { engagementSteps } from './steps/engagement';
import { groupAnswersSteps } from './steps/groupAnswers';
import { foldersSteps } from './steps/folders';
import { hiddenSectionSteps } from './steps/hiddenSection';
import { inlineHiddenSteps } from './steps/inlineHidden';
import { lessonEditingSteps } from './steps/lessonEditing';
import { liveClassSteps } from './steps/liveClass';
import { mediaSlidesSteps } from './steps/mediaSlides';
import { memberAnswersSteps } from './steps/memberAnswers';
import { passwordFieldSteps } from './steps/passwordField';
import { pearlPanelSteps } from './steps/pearlPanel';
import { presenceColumnSteps } from './steps/presenceColumn';
import { presenterBarSteps } from './steps/presenterBar';
import { regroupingSteps } from './steps/regrouping';
import { retentionSteps } from './steps/retention';
import { rosterImportSteps } from './steps/rosterImport';
import { scanningSteps } from './steps/scanning';
import { scoringSteps } from './steps/scoring';
import { scopeBadgeSteps } from './steps/scopeBadge';
import { shellSteps } from './steps/shell';
import { signInSteps } from './steps/signIn';
import { slideBadgesSteps } from './steps/slideBadges';
import { slideCopySteps } from './steps/slideCopy';
import { slidePicturesSteps } from './steps/slidePictures';
import { standingsSteps } from './steps/standings';
import { studentSlidesSteps } from './steps/studentSlides';
import { twoClassesSteps } from './steps/twoClasses';
import { twoDevicesSteps } from './steps/twoDevices';
import { visitorBoardSteps } from './steps/visitorBoard';
import { launchBrowser, storedRecords, type RosterEntry, type World } from './world';

/** The whole product, step by step, in one browser session: a failed step names itself, and the steps after it show what it broke. */
describe('walkthrough', () => {
  const world = { baseUrl: inject('baseUrl'), errors: [], roster: [], firstClassCode: '', importedLessonId: '', joinUrl: '', stageSlide: 0 } as unknown as World;

  beforeAll(async () => {
    world.browser = await launchBrowser();
    world.admin = await Device.open(world.browser, 'teacher', world.baseUrl, DESKTOP, world.errors);
    await world.admin.waitFor(SAMPLE.title);
    const students = await storedRecords<RosterEntry>(world.admin, 'students');
    world.roster = students.sort((a, b) => a.cardNumber - b.cardNumber);
  });

  afterAll(async () => {
    await world.browser?.close();
  });

  passwordFieldSteps(world);
  signInSteps(world);
  shellSteps(world);
  classesSteps(world);
  lessonEditingSteps(world);
  dialogsSteps(world);
  scopeBadgeSteps(world);
  slideCopySteps(world);
  slidePicturesSteps(world);
  hiddenSectionSteps(world);
  slideBadgesSteps(world);
  inlineHiddenSteps(world);
  foldersSteps(world);
  mediaSlidesSteps(world);
  liveClassSteps(world);
  studentSlidesSteps(world);
  presenterBarSteps(world);
  pearlPanelSteps(world);
  twoDevicesSteps(world);
  twoClassesSteps(world);
  memberAnswersSteps(world);
  classCardsSteps(world);
  scoringSteps(world);
  groupAnswersSteps(world);
  scanningSteps(world);
  visitorBoardSteps(world);
  attendanceSteps(world);
  presenceColumnSteps(world);
  engagementSteps(world);
  regroupingSteps(world);
  rosterImportSteps(world);
  endOfClassSteps(world);
  standingsSteps(world);
  retentionSteps(world);

  it('no page raised an error', () => {
    expect(world.errors).toEqual([]);
  });
});
