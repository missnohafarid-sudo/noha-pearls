import { describe, expect, it } from 'vitest';
import { admittedDevices, awaitingAdmission, canClaimSeat, contestedRequestNumber, isAdmitted, isNameHeldElsewhere, isSeatOfGroupPage, joinLanding, namesHeldByOthers, returnGroupId, seatAnswerer, requestNumber, seatGroupId, seatLoss, seatsDisplacedBy, seatsForBulkAdmission, seatsForCards, seatsNeedingTap, studentsJoiningRoll } from './admission';
import { addToRoll, countedGroups, isOnRoll, isPresent, joinRoll, markAbsent, presentGroups, presentStudents, rollTaken, sightingChangesAnything } from './attendance';
import { buildMonitor, RewardIndex, studentReport, tallyChoices } from './analytics';
import { answersForWholeGroup, answerStatusByGroup, canAnswer, canScanCards, deviceAnswer, effectiveAnswer, nextManualChoice, nextManualChoiceFor, normalizeAnswerValue, subjectFor, tallyAnswerers } from './answering';
import { CardReadStabilizer, choiceFromCorners, presenceReadings, type Point } from './cards';
import { toAsciiDigits } from './digits';
import { removeOption } from './choices';
import { isMoveKey, listKeyEffect, movedIndex, typeaheadIndex } from './listNavigation';
import { exportLesson, importLesson, lessonFileText } from './lessonFormat';
import { addSlide, createLesson, duplicateSlide, indexAfterRemoval, moveSlide, removeSlide, slideHasProblem, updateSlide } from './lessonOps';
import { isHttpsUrl, MEDIA_CHOICES, MEDIA_TYPES, mediaLink, mediaView, steppedZoom } from './media';
import type { Answer, AttendedRoster, ClassRecord, ClassRoster, Reward, ChoiceSlide, Group, Lesson, MediaSlide, Participant, SchoolClass, Session, Student, Teacher, TextSlide } from './models';
import { resolveStudentView } from './pacing';
import { addStudentToRoster, cardLabel, createGroup, createSchoolClass, groupById, isCardNumberFree, isOnRoster, moveStudent, nextCardNumber, renameGroupIn, rosterOf, schoolClassForPage, studentByCard, studentById } from './roster';
import { applyRoster, exportRosterText, parseRosterText, type RosterEntry } from './rosterFormat';
import { cleanMessage, cleanName, MAX_MESSAGE_LENGTH } from './text';
import { countingQuestions, interactionsOf, isUnresponsive, minInteractions, possibleInteractions, withMinInteractions } from './engagement';
import { canGivePeerHeart, canGiveTeacherHeart, peerRewardTargets } from './rewards';
import { acceptsChanges, canRemoveClass, canRemoveLesson, codeToFillIn, canRemoveTeacher, isLive, liveSessionForPage, hasGroupsToStart, liveSessions, newUniqueJoinCode, recentlyEnded, sessionBasis, sessionForPage } from './sessions';
import { createTeacher } from './teachers';
import { inPeriod, periodAt, periodDates, shiftPeriod, SCHOOL_UTC_OFFSET_MS } from './periods';
import { classRecord } from './records';
import { ownStanding, recordsIn, standings } from './standings';
import { nextOrder, onlyOne, sortByOrder } from './lists';
import { optionMark, pearlsEarned, PEARL_COUNT, pointsFor, publishedKeys, rankScores, scoreboard, studentPoints, teacherKeys, verdictFor } from './scoring';

const choice: ChoiceSlide = {
  id: 'q1', kind: 'choice', title: 'س', tag: '', prompt: '؟', options: ['a', 'b', 'c'],
  correctIndex: 1, explanation: 'لأن', scope: 'individual', points: 2,
};
const groupText: TextSlide = {
  id: 'q2', kind: 'text', title: 'ن', tag: '', prompt: '؟', placeholder: '', scope: 'group', points: 3,
};
const lesson: Lesson = {
  id: 'l1', folderId: null, title: 'درس', subject: '', grade: '', published: true, slides: [choice, groupText], updatedAt: 0,
};
const groups: Group[] = [
  { id: 'g1', classId: 'c1', name: 'أ', color: '#000', order: 1 },
  { id: 'g2', classId: 'c1', name: 'ب', color: '#111', order: 2 },
];
const students: Student[] = [
  { id: 's1', name: 'سلمى أحمد', cardNumber: 1, groupId: 'g1' },
  { id: 's2', name: 'نور خالد', cardNumber: 2, groupId: 'g1' },
  { id: 's3', name: 'ريم يوسف', cardNumber: 4, groupId: 'g2' },
];
const everyone: AttendedRoster = { groups, students, present: null };
const session: Session = {
  id: 'x', code: 'ABC234', lessonId: 'l1', classId: 'c1', className: '11-3', teacherId: 't1', teacherName: 'أ. هدى', status: 'live', slideIndex: 1,
  reveals: {}, pacing: {}, message: null, startedAt: 0,
};
const answer = (slideId: string, kind: 'student' | 'group', id: string, value: number | string): Answer => ({
  id: `${slideId}:${id}`, sessionId: 'x', slideId, subject: { kind, id }, value, source: 'device', at: 0,
});

describe('answer cards', () => {
  const upright: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it('reads the edge held upward as the choice', () => {
    expect(choiceFromCorners(upright)).toBe(0);
    // The marker's own corners, in order, after the card is physically turned.
    const turnedClockwise: Point[] = [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
    expect(choiceFromCorners(turnedClockwise)).toBe(3);
    const upsideDown: Point[] = [{ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(choiceFromCorners(upsideDown)).toBe(2);
    const turnedCounterClockwise: Point[] = [{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(choiceFromCorners(turnedCounterClockwise)).toBe(1);
  });

  it('accepts a reading only once it repeats on consecutive frames', () => {
    const stabilizer = new CardReadStabilizer(2);
    const frame = (choice: number) => stabilizer.observeFrame([{ cardNumber: 7, choice }]);
    expect(frame(1)).toEqual([]);
    expect(frame(2)).toEqual([]);
    expect(frame(2)).toEqual([{ cardNumber: 7, choice: 2 }]);
    expect(frame(2)).toEqual([]);
    expect(frame(3)).toEqual([]);
    expect(frame(3)).toEqual([{ cardNumber: 7, choice: 3 }]);
  });

  it('reads a whole frame at once and loses the count of a card that disappears', () => {
    const stabilizer = new CardReadStabilizer(2);
    stabilizer.observeFrame([{ cardNumber: 1, choice: 0 }, { cardNumber: 2, choice: 1 }]);
    expect(stabilizer.observeFrame([{ cardNumber: 1, choice: 0 }])).toEqual([{ cardNumber: 1, choice: 0 }]);
    // Card 2 was missing from a frame, so its earlier sighting no longer counts.
    expect(stabilizer.observeFrame([{ cardNumber: 2, choice: 1 }])).toEqual([]);
    expect(stabilizer.observeFrame([{ cardNumber: 2, choice: 1 }])).toEqual([{ cardNumber: 2, choice: 1 }]);
  });

  it('reports a card again after it is forgotten', () => {
    const stabilizer = new CardReadStabilizer(2);
    const seen = [{ cardNumber: 5, choice: 2 }];
    stabilizer.observeFrame(seen);
    expect(stabilizer.observeFrame(seen)).toEqual(seen);
    expect(stabilizer.observeFrame(seen)).toEqual([]);
    stabilizer.forget(5);
    expect(stabilizer.observeFrame(seen)).toEqual(seen);
  });
});

describe('lesson file', () => {
  it('survives an export/import round trip', () => {
    const result = importLesson(exportLesson(lesson));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.slides.map(({ id: _id, ...rest }) => rest)).toEqual(lesson.slides.map(({ id: _id, ...rest }) => rest));
    expect(result.lesson.published).toBe(false);
  });

  it('keeps a lesson as a fenced block and nothing else, and reads it back whole, braces in its title included', () => {
    const braced = { ...lesson, title: 'مجموعة {أ} و{ب}' };
    const text = lessonFileText(braced);
    expect(text.startsWith('```json\n{')).toBe(true);
    expect(text.endsWith('}\n```\n')).toBe(true);
    const result = importLesson(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.title).toBe(braced.title);
    expect(result.lesson.slides.map(({ id: _id, ...rest }) => rest)).toEqual(lesson.slides.map(({ id: _id, ...rest }) => rest));
  });

  it('reads a file wrapped in chat prose and a code fence', () => {
    const reply = `تفضّل الملف:\n\`\`\`json\n${exportLesson(lesson)}\n\`\`\`\nبالتوفيق!`;
    expect(importLesson(reply).ok).toBe(true);
  });

  it('reports every problem with its slide number', () => {
    const file = {
      format: 'spectrum-lesson', version: 1, title: 'درس',
      slides: [
        { kind: 'choice', title: 'س', prompt: '؟', options: ['واحد'], correct: 5 },
        { kind: 'video', title: 'x' },
        { kind: 'content', body: 'بلا عنوان' },
      ],
    };
    const result = importLesson(JSON.stringify(file));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { code: 'bad-options', slide: 1, field: 'options' },
      { code: 'bad-correct', slide: 1, field: 'correct' },
      { code: 'unknown-kind', slide: 2, field: 'kind' },
      { code: 'missing-field', slide: 3, field: 'title' },
    ]);
  });

  it('reports what it would otherwise repair', () => {
    const issues = (slide: object) => {
      const result = importLesson(JSON.stringify({ format: 'spectrum-lesson', version: 1, title: 'د', slides: [slide] }));
      return result.ok ? [] : result.issues.map((i) => i.code);
    };
    const base = { kind: 'choice', title: 'س', prompt: '؟', options: ['أ', 'ب', 'ج'], correct: 2 };
    expect(issues(base)).toEqual([]);
    expect(issues({ ...base, options: ['', 'ب', 'ج'] })).toEqual(['bad-options']);
    expect(issues({ ...base, options: ['أ', null, 'ج'] })).toEqual(['bad-options']);
    expect(issues({ ...base, options: [4, 5.5, ' ٧ '] })).toEqual([]);
    expect(issues({ ...base, scope: 'groups' })).toEqual(['bad-scope']);
    expect(issues({ ...base, scope: 'group' })).toEqual([]);
    expect(issues({ ...base, points: '2' })).toEqual(['bad-points']);
    expect(issues({ ...base, points: 25 })).toEqual(['bad-points']);
    expect(issues({ ...base, points: 1.5 })).toEqual(['bad-points']);
    expect(issues({ ...base, points: 0 })).toEqual([]);
    expect(issues({ kind: 'text', title: 'ن', prompt: '؟', scope: 5 })).toEqual(['bad-scope']);
  });

  it('turns a number option into its text and gives each kind its default scope', () => {
    const result = importLesson(
      JSON.stringify({
        format: 'spectrum-lesson', version: 1, title: 'د',
        slides: [
          { kind: 'choice', title: 'س', prompt: '؟', options: [4, 5] },
          { kind: 'text', title: 'ن', prompt: '؟' },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.slides[0]).toMatchObject({ options: ['4', '5'], scope: 'individual', points: 1 });
    expect(result.lesson.slides[1]).toMatchObject({ scope: 'group', points: 1 });
  });

  it('tells text with braces that does not parse from text with no object', () => {
    const unescaped = '{"format":"spectrum-lesson","title":"قال "مرحبا" ثم","slides":[]}';
    expect(importLesson(unescaped)).toEqual({ ok: false, issues: [{ code: 'bad-json', slide: null, field: null }] });
    expect(importLesson('} {')).toEqual({ ok: false, issues: [{ code: 'not-json', slide: null, field: null }] });
  });

  it('rejects text that holds no lesson', () => {
    expect(importLesson('مرحبا')).toEqual({ ok: false, issues: [{ code: 'not-json', slide: null, field: null }] });
    const wrong = importLesson('{"title":"x","slides":[]}');
    expect(wrong.ok).toBe(false);
  });
});

describe('lesson file: media slides', () => {
  const mediaSlide: MediaSlide = { id: 'm1', kind: 'media', title: 'صورة', tag: 'الشرح', url: 'https://example.org/a.png', media: 'image', body: '- نقطة\nنص' };
  const fileWith = (slide: object) => JSON.stringify({ format: 'spectrum-lesson', version: 1, title: 'د', slides: [slide] });
  const issues = (slide: object) => {
    const result = importLesson(fileWith(slide));
    return result.ok ? [] : result.issues.map((i) => i.code);
  };
  const base = { kind: 'media', title: 'س', url: 'https://example.org/clip.mp4' };

  it('survives an export/import round trip', () => {
    const result = importLesson(exportLesson({ ...lesson, slides: [mediaSlide] }));
    expect(result.ok).toBe(true);
    const { id: _id, ...expected } = mediaSlide;
    if (result.ok) expect(result.lesson.slides.map(({ id: _slideId, ...rest }) => rest)).toEqual([expected]);
  });

  it('defaults the type to auto and the text to nothing', () => {
    const result = importLesson(fileWith(base));
    expect(result.ok && result.lesson.slides[0]).toMatchObject({ kind: 'media', media: 'auto', body: '', tag: '' });
  });

  it('refuses an address that is not https, and a type that is not one of the six; an empty address is accepted and flagged', () => {
    expect(issues(base)).toEqual([]);
    expect(issues({ ...base, url: undefined })).toEqual([]);
    expect(issues({ ...base, url: '' })).toEqual([]);
    expect(issues({ ...base, url: 'http://example.org/a.png' })).toEqual(['bad-url']);
    expect(issues({ ...base, url: 'example.org/a.png' })).toEqual(['bad-url']);
    expect(issues({ ...base, url: 'javascript:alert(1)' })).toEqual(['bad-url']);
    expect(issues({ ...base, media: 'film' })).toEqual(['bad-media']);
    expect(issues({ ...base, media: 'pdf' })).toEqual([]);
    expect(issues({ ...base, media: 'auto' })).toEqual([]);
  });

  it('imports a media slide with no address, as the editor allows, and flags it', () => {
    const result = importLesson(fileWith({ ...base, url: '' }));
    expect(result.ok && result.lesson.slides[0]).toMatchObject({ kind: 'media', url: '' });
    if (result.ok) expect(slideHasProblem(result.lesson.slides[0])).toBe(true);
  });

  it('accepts a link whose type cannot be known: the slide is flagged, not refused', () => {
    const result = importLesson(fileWith({ ...base, url: 'https://example.org/page' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(slideHasProblem(result.lesson.slides[0])).toBe(true);
  });
});

describe('which slides have a problem', () => {
  const media = (url: string, type: MediaSlide['media'] = 'auto'): MediaSlide => ({ id: 'm', kind: 'media', title: '', tag: '', url, media: type, body: '' });

  it('flags a media slide that cannot be drawn and no other', () => {
    expect(slideHasProblem(media(''))).toBe(true);
    expect(slideHasProblem(media('http://example.org/a.png'))).toBe(true);
    expect(slideHasProblem(media('https://example.org/page'))).toBe(true);
    expect(slideHasProblem(media('https://example.org/page', 'image'))).toBe(false);
    expect(slideHasProblem(media('https://example.org/a.png'))).toBe(false);
    expect(slideHasProblem(choice)).toBe(false);
  });
});

describe('what a media link shows', () => {
  const src = (url: string, declared: Parameters<typeof mediaView>[1] = 'auto') => mediaView(url, declared);
  const DRIVE_VIEWER = 'https://drive.google.com/file/d/FILE_ID_1/preview';
  const DRIVE_SANDBOX = 'allow-scripts allow-same-origin';
  const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-forms';

  it('tells an empty, a non-https and a malformed link apart', () => {
    expect(src('')).toBe('no-link');
    expect(src('   ')).toBe('no-link');
    expect(src('http://example.org/a.png')).toBe('not-https');
    expect(src('ftp://example.org/a.png')).toBe('not-https');
    expect(src('example.org/a.png')).toBe('not-https');
    expect(src('https://')).toBe('not-https');
    expect(isHttpsUrl(' https://example.org/a ')).toBe(true);
    expect(isHttpsUrl('http://example.org')).toBe(false);
  });

  it('draws a Drive file in its own viewer, whatever the file is, and never the view address', () => {
    const general = { how: 'frame', src: DRIVE_VIEWER, shape: 'embed', sandbox: DRIVE_SANDBOX, referrerPolicy: 'no-referrer' };
    expect(src('https://drive.google.com/file/d/FILE_ID_1/view?usp=drive_link')).toEqual(general);
    expect(src('https://drive.google.com/file/d/FILE_ID_1/view')).toEqual(general);
    expect(src('https://drive.google.com/file/d/FILE_ID_1')).toEqual(general);
    expect(src('https://drive.google.com/file/d/FILE_ID_1/edit?usp=sharing&x=1#top')).toEqual(general);
    expect(src('https://drive.google.com/open?id=FILE_ID_1')).toEqual(general);
  });

  it('lets the declared type choose only the shape of the Drive frame', () => {
    for (const shape of ['audio', 'video', 'pdf', 'embed'] as const) {
      expect(src('https://drive.google.com/file/d/FILE_ID_1/view', shape)).toEqual({ how: 'frame', src: DRIVE_VIEWER, shape, sandbox: DRIVE_SANDBOX, referrerPolicy: 'no-referrer' });
    }
  });

  it('draws a declared photo from Drive as a plain image', () => {
    expect(src('https://drive.google.com/file/d/FILE_ID_1/view?usp=drive_link', 'image')).toEqual({
      how: 'image',
      src: 'https://drive.google.com/thumbnail?id=FILE_ID_1&sz=w2000',
    });
    expect(src('https://drive.google.com/open?id=FILE_ID_1', 'image')).toMatchObject({ how: 'image' });
  });

  it('does not take a Drive address without a file for a file', () => {
    expect(src('https://drive.google.com/drive/folders/FOLDER_ID_1')).toBe('unknown-type');
    expect(src('https://drive.google.com/open')).toBe('unknown-type');
  });

  it('draws a PhET simulation from its HTML5 file, in Arabic, with scripts only', () => {
    const view = {
      how: 'frame',
      src: 'https://phet.colorado.edu/sims/html/energy-forms-and-changes/latest/energy-forms-and-changes_all.html?locale=ar',
      shape: 'embed',
      sandbox: 'allow-scripts',
      referrerPolicy: 'no-referrer',
    };
    expect(src('https://phet.colorado.edu/en/simulations/energy-forms-and-changes')).toEqual(view);
    expect(src('https://phet.colorado.edu/ar/simulations/energy-forms-and-changes/')).toEqual(view);
    expect(src('https://phet.colorado.edu/en/simulations/energy-forms-and-changes?x=1')).toEqual(view);
    expect(src('https://phet.colorado.edu/en/simulations/category/physics')).toBe('unknown-type');
  });

  it('draws a PowerPoint sharing link with its query replaced by the embed one', () => {
    expect(src('https://school-my.sharepoint.com/:p:/g/personal/user_school/SHARE_ID_1?e=abc&xsdata=1')).toEqual({
      how: 'frame',
      src: 'https://school-my.sharepoint.com/:p:/g/personal/user_school/SHARE_ID_1?action=embedview',
      shape: 'embed',
      sandbox: 'allow-scripts allow-same-origin allow-forms',
      referrerPolicy: 'no-referrer',
    });
    expect(src('https://school-my.sharepoint.com/:w:/g/personal/user_school/SHARE_ID_1')).toBe('unknown-type');
    expect(src('https://example.org/:p:/g/personal/x')).toBe('unknown-type');
  });

  it('draws a YouTube video from the no-cookie embed address', () => {
    const view = { how: 'frame', src: 'https://www.youtube-nocookie.com/embed/VIDEO_ID_1', shape: 'video', sandbox: 'allow-scripts allow-same-origin', referrerPolicy: 'strict-origin-when-cross-origin' };
    expect(src('https://www.youtube.com/watch?v=VIDEO_ID_1&t=30s')).toEqual(view);
    expect(src('https://youtube.com/watch?v=VIDEO_ID_1')).toEqual(view);
    expect(src('https://youtu.be/VIDEO_ID_1?si=abc')).toEqual(view);
    expect(src('https://www.youtube.com/channel/CHANNEL_ID_1')).toBe('unknown-type');
  });

  it('tells a direct file by the extension of its path, in any case, ignoring the query', () => {
    for (const name of ['a.jpg', 'a.JPEG', 'a.png', 'a.gif', 'a.webp', 'a.svg?x=1.mp3']) expect(src(`https://example.org/files/${name}`)).toEqual({ how: 'image', src: `https://example.org/files/${name}` });
    for (const name of ['a.mp3', 'a.WAV', 'a.ogg', 'a.m4a?dl=1']) expect(src(`https://example.org/${name}`)).toMatchObject({ how: 'audio' });
    for (const name of ['a.mp4', 'a.WEBM?t=3']) expect(src(`https://example.org/${name}`)).toMatchObject({ how: 'video' });
    expect(src('https://example.org/book.PDF?page=2')).toEqual({ how: 'frame', src: 'https://example.org/book.PDF?page=2', shape: 'pdf', sandbox: null, referrerPolicy: 'no-referrer' });
  });

  it('makes a link it cannot classify a problem, and a declared type solves it', () => {
    expect(src('https://example.org/page')).toBe('unknown-type');
    expect(src('https://example.org/')).toBe('unknown-type');
    expect(src('https://example.org/file.docx')).toBe('unknown-type');
    expect(src('https://example.org/page', 'image')).toEqual({ how: 'image', src: 'https://example.org/page' });
    expect(src('https://example.org/page', 'audio')).toMatchObject({ how: 'audio' });
    expect(src('https://example.org/page', 'video')).toMatchObject({ how: 'video' });
    expect(src('https://example.org/page', 'pdf')).toEqual({ how: 'frame', src: 'https://example.org/page', shape: 'pdf', sandbox: EMBED_SANDBOX, referrerPolicy: 'no-referrer' });
    expect(src('https://example.org/page', 'embed')).toEqual({
      how: 'frame',
      src: 'https://example.org/page',
      shape: 'embed',
      sandbox: EMBED_SANDBOX,
      referrerPolicy: 'no-referrer',
    });
  });

  it('lets a declared type win over the extension', () => {
    expect(src('https://example.org/a.mp3', 'video')).toMatchObject({ how: 'video' });
    expect(src('https://example.org/a.png', 'embed')).toMatchObject({ how: 'frame', shape: 'embed' });
  });

  it('trims the pasted address', () => {
    expect(src('  https://example.org/a.png \n')).toEqual({ how: 'image', src: 'https://example.org/a.png' });
  });

  it('draws only the address that was checked: a scheme without slashes is not a relative path', () => {
    expect(src('https:evil.example/x.pdf')).toMatchObject({ shape: 'pdf', src: 'https://evil.example/x.pdf' });
    expect(src('https:evil.example/x.png')).toEqual({ how: 'image', src: 'https://evil.example/x.png' });
    expect(src('https:/path/x.png')).toEqual({ how: 'image', src: 'https://path/x.png' });
    expect(src('HTTPS://Example.ORG/a.png')).toEqual({ how: 'image', src: 'https://example.org/a.png' });
    expect(mediaLink('https:evil.example/x.pdf')).toBe('https://evil.example/x.pdf');
    expect(mediaLink('  HTTPS://Example.org/a  ')).toBe('https://example.org/a');
    expect(mediaLink('https:/path')).toBe('https://path/');
    expect(mediaLink('http://example.org/a')).toBeNull();
    expect(mediaLink('')).toBeNull();
  });

  it('leaves a frame unsandboxed only when the path really ends in .pdf', () => {
    expect(src('https://example.org/files/book.pdf')).toMatchObject({ shape: 'pdf', sandbox: null });
    expect(src('https://example.org/files/book.PDF?x=1')).toMatchObject({ shape: 'pdf', sandbox: null });
    expect(src('https://example.org/download?id=book.pdf', 'pdf')).toMatchObject({ shape: 'pdf', sandbox: EMBED_SANDBOX });
    expect(src('https://example.org/book.pdf', 'embed')).toMatchObject({ shape: 'embed', sandbox: EMBED_SANDBOX });
  });

  it('takes a Drive id from /open?id= only when it is a plain id', () => {
    expect(src('https://drive.google.com/open?id=FILE_ID_1')).toMatchObject({ src: DRIVE_VIEWER });
    expect(src('https://drive.google.com/open?id=../../url%3Fq%3Dhttps://evil.example%23')).toBe('unknown-type');
    expect(src('https://drive.google.com/open?id=X%26sz%3Dw1%23')).toBe('unknown-type');
    expect(src('https://drive.google.com/open?id=X%26sz%3Dw1%23', 'image')).toEqual({ how: 'image', src: 'https://drive.google.com/open?id=X%26sz%3Dw1%23' });
  });

  it('draws YouTube shorts, embed and live addresses from the same embed address', () => {
    const view = { how: 'frame', src: 'https://www.youtube-nocookie.com/embed/VIDEO_ID_1', shape: 'video', sandbox: 'allow-scripts allow-same-origin', referrerPolicy: 'strict-origin-when-cross-origin' };
    for (const path of ['shorts/VIDEO_ID_1', 'embed/VIDEO_ID_1', 'live/VIDEO_ID_1', 'live/VIDEO_ID_1?feature=share']) expect(src(`https://www.youtube.com/${path}`)).toEqual(view);
    expect(src('https://www.youtube.com/shorts/VIDEO_ID_1/extra')).toBe('unknown-type');
    expect(src('https://www.youtube.com/shorts/')).toBe('unknown-type');
    expect(src('https://www.youtube.com/live/..%2Fx')).toBe('unknown-type');
  });

  it('treats a look-alike host or an address with a user name as an ordinary link', () => {
    for (const lookAlike of [
      'https://drive.google.com.evil.example/file/d/x/view',
      'https://evil.example/drive.google.com/file/d/x',
      'https://phet.colorado.edu@evil.example/en/simulations/x',
      'https://www.youtube.com.evil.example/watch?v=x',
      'https://evil.example/:p:/g/x',
    ]) {
      expect(src(lookAlike)).toBe('unknown-type');
      expect(src(lookAlike, 'embed')).toMatchObject({ how: 'frame', shape: 'embed', sandbox: EMBED_SANDBOX });
    }
  });

  it('declares every media type once, and the choices are `auto` then the types', () => {
    expect([...MEDIA_TYPES].sort()).toEqual(['audio', 'embed', 'image', 'pdf', 'video']);
    expect(MEDIA_CHOICES).toEqual(['auto', ...MEDIA_TYPES]);
  });
});

describe('zooming a PDF frame', () => {
  it('steps through 100, 150, 200 and 300 and stops at both ends', () => {
    expect(steppedZoom(100, 1)).toBe(150);
    expect(steppedZoom(150, 1)).toBe(200);
    expect(steppedZoom(200, 1)).toBe(300);
    expect(steppedZoom(300, 1)).toBe(300);
    expect(steppedZoom(300, -1)).toBe(200);
    expect(steppedZoom(150, -1)).toBe(100);
    expect(steppedZoom(100, -1)).toBe(100);
  });

  it('starts from the first step when given a zoom that is not a step', () => {
    expect(steppedZoom(120, 1)).toBe(150);
  });
});

describe('lesson editing', () => {
  it('adds, moves and removes slides without touching the original', () => {
    const empty = createLesson('جديد', null, 0);
    const first = addSlide(empty, 'content', -1);
    const second = addSlide(first.lesson, 'choice', 0);
    expect(empty.slides).toHaveLength(0);
    expect(second.lesson.slides.map((s) => s.kind)).toEqual(['content', 'choice']);
    const moved = moveSlide(second.lesson, second.slide.id, -1);
    expect(moved.slides.map((s) => s.kind)).toEqual(['choice', 'content']);
    expect(moveSlide(moved, second.slide.id, -1)).toBe(moved);
    expect(removeSlide(moved, second.slide.id).slides).toHaveLength(1);
  });

  it('copies a slide right below itself under a new id, leaving the original alone', () => {
    const copied = duplicateSlide(lesson, choice.id);
    expect(copied.slides).toHaveLength(lesson.slides.length + 1);
    const [original, copy] = copied.slides;
    expect(original).toBe(choice);
    expect(copy.id).not.toBe(choice.id);
    expect({ ...copy, id: '' }).toEqual({ ...choice, id: '' });
    (copy as ChoiceSlide).options.push('z');
    expect(choice.options).toEqual(['a', 'b', 'c']);
    expect(lesson.slides).toHaveLength(2);
  });

  it('leaves the lesson as it was when the slide to copy is unknown', () => {
    expect(duplicateSlide(lesson, 'nope')).toBe(lesson);
  });

  it('clears a correct answer that no longer exists and keeps points in range', () => {
    const edited = updateSlide(lesson, { ...choice, options: ['a'], correctIndex: 1, points: 500 });
    expect(edited.slides[0]).toMatchObject({ correctIndex: null, points: 20 });
  });

  it('keeps the correct answer on the same option when an option is removed', () => {
    expect(removeOption(choice, 0)).toMatchObject({ options: ['b', 'c'], correctIndex: 0 });
    expect(removeOption(choice, 1)).toMatchObject({ options: ['a', 'c'], correctIndex: null });
    expect(removeOption(choice, 2)).toMatchObject({ options: ['a', 'b'], correctIndex: 1 });
    expect(removeOption({ ...choice, correctIndex: null }, 0).correctIndex).toBeNull();
  });

  it('keeps the selection on the same slide when another is deleted', () => {
    expect(indexAfterRemoval(2, 5, 7)).toBe(2);
    expect(indexAfterRemoval(2, 0, 7)).toBe(1);
    expect(indexAfterRemoval(6, 6, 7)).toBe(5);
    expect(indexAfterRemoval(0, 0, 1)).toBe(0);
  });
});

describe('pacing', () => {
  it('resolves what a group sees for each mode', () => {
    expect(resolveStudentView(session, 'g1', 2, 0)).toEqual({ state: 'slide', slideIndex: 1, selfPaced: false });
    const paced: Session = {
      ...session,
      pacing: { g1: { mode: 'hold', slideIndex: 0 }, g2: { mode: 'free', slideIndex: 0 }, g3: { mode: 'pinned', slideIndex: 0 } },
    };
    expect(resolveStudentView(paced, 'g1', 2, 0)).toEqual({ state: 'hold' });
    expect(resolveStudentView(paced, 'g2', 2, 9)).toEqual({ state: 'slide', slideIndex: 1, selfPaced: true });
    expect(resolveStudentView(paced, 'g3', 2, 1)).toEqual({ state: 'slide', slideIndex: 0, selfPaced: false });
  });
});

describe('answering rules', () => {
  it('closes a question once it is revealed or the session ends', () => {
    expect(canAnswer(session, choice)).toBe(true);
    expect(canAnswer({ ...session, reveals: { q1: { correctIndex: 1, explanation: '' } } }, choice)).toBe(false);
    expect(canAnswer({ ...session, status: 'ended' }, choice)).toBe(false);
  });

  it('decides who a device answers for', () => {
    expect(subjectFor(groupText, { groupId: 'g1', studentId: null })).toEqual({ kind: 'group', id: 'g1' });
    expect(subjectFor(choice, { groupId: 'g1', studentId: 's1' })).toEqual({ kind: 'student', id: 's1' });
    expect(subjectFor(choice, { groupId: 'g1', studentId: null })).toEqual({ kind: 'group', id: 'g1' });
  });

  it('offers card scanning for individual choice questions only', () => {
    expect(canScanCards(session, choice)).toBe(true);
    expect(canScanCards(session, { ...choice, scope: 'group' })).toBe(false);
    expect(canScanCards(session, groupText)).toBe(false);
  });

  it('steps a hand-entered answer through the options and back to none', () => {
    expect([null, 0, 1, 2].map((current) => nextManualChoice(current, 3))).toEqual([0, 1, 2, null]);
  });

  it('rejects values that do not fit the question', () => {
    expect(normalizeAnswerValue(choice, 3)).toBeNull();
    expect(normalizeAnswerValue(choice, 2)).toBe(2);
    expect(normalizeAnswerValue(groupText, '   ')).toBeNull();
    expect(normalizeAnswerValue(groupText, ' نص ')).toBe('نص');
  });
});

describe('scoring and read models', () => {
  const answers = [
    answer('q1', 'student', 's1', 1),
    answer('q1', 'student', 's2', 0),
    answer('q1', 'student', 's3', 1),
    answer('q2', 'group', 'g1', 'تفسير'),
  ];

  it('marks answers', () => {
    const keys = teacherKeys(session);
    expect(verdictFor(choice, answers[0], keys)).toBe('correct');
    expect(verdictFor(choice, answers[1], keys)).toBe('wrong');
    expect(verdictFor(groupText, answers[3], keys)).toBe('recorded');
    expect(verdictFor({ ...choice, correctIndex: null }, answers[1], keys)).toBe('recorded');
  });

  it('keeps an unrevealed answer pending for students and the board, but not for the teacher', () => {
    expect(verdictFor(choice, answers[0], publishedKeys(session))).toBe('pending');
    expect(pointsFor(choice, answers[0], publishedKeys(session))).toBe(0);
    const onlyCorrect = [answers[0]];
    expect(scoreboard(lesson, everyone, onlyCorrect, publishedKeys(session))[0].score).toBe(0);
    expect(scoreboard(lesson, everyone, onlyCorrect, teacherKeys(session))[0].score).toBe(1);
  });

  it('marks by the revealed key even when the lesson key is edited afterwards', () => {
    const revealed: Session = { ...session, reveals: { q1: { correctIndex: 1, explanation: '' } } };
    const edited: Lesson = { ...lesson, slides: [{ ...choice, correctIndex: 0 }, groupText] };
    const given = [answers[0]];
    for (const keys of [publishedKeys(revealed), teacherKeys(revealed)]) {
      expect(verdictFor(edited.slides[0] as ChoiceSlide, given[0], keys)).toBe('correct');
      expect(scoreboard(edited, everyone, given, keys)[0].score).toBe(1);
    }
  });

  it('scores a group as its members average plus its shared points', () => {
    expect(scoreboard(lesson, everyone, answers, teacherKeys(session))).toEqual([
      { groupId: 'g1', score: 4, max: 5 },
      { groupId: 'g2', score: 2, max: 5 },
    ]);
  });

  it('ranks groups, sharing a rank on a tie', () => {
    const ranked = rankScores([
      { groupId: 'a', score: 2, max: 5 },
      { groupId: 'b', score: 4, max: 5 },
      { groupId: 'c', score: 2, max: 5 },
    ]);
    expect(ranked.map((r) => [r.groupId, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2]]);
  });

  it('marks options before and after the reveal', () => {
    const key = { correctIndex: 1, explanation: '' };
    expect([0, 1, 2].map((i) => optionMark(null, i, 0))).toEqual(['selected', 'idle', 'idle']);
    expect([0, 1, 2].map((i) => optionMark(key, i, 0))).toEqual(['wrong', 'correct', 'idle']);
    expect(optionMark({ correctIndex: null, explanation: '' }, 0, 0)).toBe('selected');
  });

  it('tallies choices and builds the monitor', () => {
    expect(tallyChoices(choice, everyone, [], answers)).toEqual([1, 2, 0]);
    const [first] = buildMonitor(lesson, session, everyone, answers, [
      { id: 'p', sessionId: 'x', groupId: 'g1', studentId: 's1', joinedAt: 0, admitted: true },
      { id: 'q', sessionId: 'x', groupId: 'g1', studentId: 's2', joinedAt: 0, admitted: false },
    ], teacherKeys(session));
    expect(first.rows.map((r) => [r.student.id, r.joined, r.points, r.cells[0].verdict])).toEqual([
      ['s1', true, 2, 'correct'],
      ['s2', false, 0, 'wrong'],
    ]);
    expect(first.groupCells[0].verdict).toBe('recorded');
  });

  it('counts hearts by source and rolls members up into their group', () => {
    const index = new RewardIndex([
      { id: '1', sessionId: 'x', target: { kind: 'student', id: 's1' }, source: 'teacher', at: 0 },
      { id: '2', sessionId: 'x', target: { kind: 'student', id: 's1' }, source: 'peer', at: 0 },
      { id: '3', sessionId: 'x', target: { kind: 'group', id: 'g1' }, source: 'guest', at: 0 },
    ]);
    expect(index.of({ kind: 'student', id: 's1' })).toEqual({ total: 2, bySource: { teacher: 1, peer: 1, guest: 0, supervisor: 0 } });
    expect(index.groupTotal(groups[0], students)).toBe(3);
    expect(index.groupTotal(groups[1], students)).toBe(0);
  });

  it('hands out the lowest free card number', () => {
    expect(nextCardNumber(students)).toBe(3);
  });
});

describe('classes and their rosters', () => {
  const classes: SchoolClass[] = [
    { id: 'c2', name: 'ب', order: 2 },
    { id: 'c1', name: 'أ', order: 1 },
  ];
  const otherGroup: Group = { id: 'g9', classId: 'c2', name: 'ج', color: '#222', order: 1 };
  const otherStudent: Student = { id: 's9', name: 'هدى', cardNumber: 1, groupId: 'g9' };

  it('takes the groups of a class and the students in them, each in its order', () => {
    const roster = rosterOf([groups[1], groups[0]], [students[2], otherStudent, students[1], students[0]]);
    expect(roster.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(roster.students.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('numbers cards within a class only: two classes may both hold card 1', () => {
    expect(nextCardNumber(rosterOf([otherGroup], [...students, otherStudent]).students)).toBe(2);
    expect(isCardNumberFree(1, 'new', rosterOf([otherGroup], [...students, otherStudent]).students)).toBe(false);
    expect(isCardNumberFree(1, 'new', rosterOf([otherGroup], students).students)).toBe(true);
  });

  it('creates a group in its class, after the groups it has', () => {
    const made = createGroup('د', 'c1', groups);
    expect(made).toMatchObject({ classId: 'c1', name: 'د', order: 3 });
  });

  it('creates a class after the others', () => {
    expect(createSchoolClass('جـ', classes)).toMatchObject({ name: 'جـ', order: 3 });
  });

  it('shows the class the address names, else the first by order', () => {
    expect(schoolClassForPage(classes, 'c2')?.id).toBe('c2');
    expect(schoolClassForPage(classes, undefined)?.id).toBe('c1');
    expect(schoolClassForPage(classes, 'zzz')).toBeNull();
    expect(schoolClassForPage([], undefined)).toBeNull();
  });

});

describe("a session's own roster", () => {
  const roster = rosterOf(groups, students);

  it('moves a student to another group of the roster and changes nothing else', () => {
    const moved = moveStudent(roster, 's1', 'g2')!;
    expect(moved.students.map((s) => [s.id, s.groupId, s.cardNumber])).toEqual([['s1', 'g2', 1], ['s2', 'g1', 2], ['s3', 'g2', 4]]);
    expect(moved.groups).toEqual(roster.groups);
    expect(roster.students[0].groupId).toBe('g1');
  });

  it('refuses to move a student who is not on the roster, or into a group that is not', () => {
    expect(moveStudent(roster, 's9', 'g2')).toBeNull();
    expect(moveStudent(roster, 's1', 'g9')).toBeNull();
  });

  it('adds a student with the lowest card number free in this roster, in the group given', () => {
    const added = addStudentToRoster(roster, '  هدى  ', 'g2')!;
    expect(added.student).toMatchObject({ name: 'هدى', groupId: 'g2', cardNumber: 3 });
    expect(added.roster.students.map((s) => s.cardNumber)).toEqual([1, 2, 3, 4]);
    expect(addStudentToRoster(added.roster, 'منى', 'g1')!.student.cardNumber).toBe(5);
  });

  it('refuses to add a student with a blank name or to a group that is not on the roster', () => {
    expect(addStudentToRoster(roster, '   ', 'g1')).toBeNull();
    expect(addStudentToRoster(roster, 'هدى', 'g9')).toBeNull();
  });

  it('renames a group of the roster, refusing a blank name or an unknown group', () => {
    expect(renameGroupIn(roster, 'g1', ' الأولى ')!.groups.map((g) => g.name)).toEqual(['الأولى', 'ب']);
    expect(renameGroupIn(roster, 'g1', ' ')).toBeNull();
    expect(renameGroupIn(roster, 'g9', 'س')).toBeNull();
  });

  it('knows who is on the roster', () => {
    expect(isOnRoster(roster, { kind: 'student', id: 's1' })).toBe(true);
    expect(isOnRoster(roster, { kind: 'student', id: 's9' })).toBe(false);
    expect(isOnRoster(roster, { kind: 'group', id: 'g2' })).toBe(true);
    expect(isOnRoster(roster, { kind: 'group', id: 's1' })).toBe(false);
  });

  it('accepts changes only while the class is running', () => {
    expect(acceptsChanges(session)).toBe(true);
    expect(acceptsChanges({ ...session, status: 'ended' })).toBe(false);
    expect(acceptsChanges(null)).toBe(false);
  });
});

describe('teachers', () => {
  it('creates a teacher after the others and lists them in the order they were added, not by name', () => {
    const first = createTeacher('ب', []);
    const second = createTeacher('أ', [first]);
    expect(second).toMatchObject({ name: 'أ', order: 2 });
    expect(second.id).not.toBe('');
    expect(sortByOrder([second, first]).map((teacher) => teacher.name)).toEqual(['ب', 'أ']);
  });
});

describe('hearts', () => {
  const seat = (studentId: string | null, groupId = 'g1'): Participant => ({
    id: 'p', sessionId: 'x', groupId, studentId, joinedAt: 0, admitted: true,
  });

  it('lets a named student encourage a classmate of another group in a live class only', () => {
    expect(canGivePeerHeart(session, seat('s1'), students[2], students)).toBe(true);
    expect(canGivePeerHeart(session, seat('s1'), students[1], students)).toBe(false);
    expect(canGivePeerHeart(session, seat('s1'), students[0], students)).toBe(false);
    expect(canGivePeerHeart(session, seat(null), students[2], students)).toBe(false);
    expect(canGivePeerHeart({ ...session, status: 'ended' }, seat('s1'), students[2], students)).toBe(false);
  });

  it('gives the teacher\'s heart to a student or group on the roster, in a live class and after it ended', () => {
    const ended: Session = { ...session, status: 'ended' };
    for (const given of [session, ended]) {
      expect(canGiveTeacherHeart(given, everyone, { kind: 'student', id: 's1' })).toBe(true);
      expect(canGiveTeacherHeart(given, everyone, { kind: 'group', id: 'g2' })).toBe(true);
      expect(canGiveTeacherHeart(given, everyone, { kind: 'student', id: 'nobody' })).toBe(false);
      expect(canGiveTeacherHeart(given, everyone, { kind: 'group', id: 'nobody' })).toBe(false);
    }
    expect(canGiveTeacherHeart(null, everyone, { kind: 'student', id: 's1' })).toBe(false);
  });

  it('judges a moved student by the group she is in now, not the one she joined', () => {
    const moved = students.map((s) => (s.id === 's1' ? { ...s, groupId: 'g2' } : s));
    expect(canGivePeerHeart(session, seat('s1'), moved[1], moved)).toBe(true);
    expect(canGivePeerHeart(session, seat('s1'), moved[2], moved)).toBe(false);
  });

  it('lists the classmates a student may encourage', () => {
    expect(peerRewardTargets(session, seat('s1'), students).map((s) => s.id)).toEqual(['s3']);
    expect(peerRewardTargets(session, seat(null), students)).toEqual([]);
  });
});

describe('admission', () => {
  const device = (id: string, studentId: string | null, joinedAt: number, admitted: boolean): Participant => ({
    id, sessionId: 'x', groupId: 'g1', studentId, joinedAt, admitted,
  });
  const devices = [device('a', 's1', 30, false), device('b', 's2', 10, false), device('c', null, 20, true), device('d', 's3', 5, true)];

  it('tells admitted devices from waiting ones', () => {
    expect(isAdmitted(devices[0])).toBe(false);
    expect(admittedDevices(devices).map((p) => p.id)).toEqual(['c', 'd']);
  });

  it('lists the waiting devices, oldest request first', () => {
    expect(awaitingAdmission(devices).map((p) => p.id)).toEqual(['b', 'a']);
  });

  const roster = rosterOf(groups, students);

  it('lets a device ask for a name of a group of the session roster in a live class', () => {
    expect(canClaimSeat(session, roster, 'g1', 's1')).toBe(true);
  });

  it('refuses a seat in an ended or unknown class, or an unknown group', () => {
    expect(canClaimSeat({ ...session, status: 'ended' }, roster, 'g1', 's1')).toBe(false);
    expect(canClaimSeat(null, roster, 'g1', 's1')).toBe(false);
    expect(canClaimSeat(session, roster, 'g9', null)).toBe(false);
  });

  it('refuses a name that is not on the roster or belongs to another group', () => {
    expect(canClaimSeat(session, roster, 'g1', 's3')).toBe(false);
    expect(canClaimSeat(session, roster, 'g1', 's9')).toBe(false);
    expect(canClaimSeat(session, roster, 'g2', 's1')).toBe(false);
  });

  it('refuses everything on an empty roster', () => {
    expect(canClaimSeat(session, { groups: [], students: [] }, 'g1', null)).toBe(false);
  });

  it('lets a shared group device ask without a name', () => {
    expect(canClaimSeat(session, roster, 'g1', null)).toBe(true);
  });

  it('puts a named seat in the group her student is in now, and a shared device in the group it joined', () => {
    const moved = students.map((s) => (s.id === 's1' ? { ...s, groupId: 'g2' } : s));
    expect(seatGroupId(device('a', 's1', 0, true), students)).toBe('g1');
    expect(seatGroupId(device('a', 's1', 0, true), moved)).toBe('g2');
    expect(seatGroupId(device('a', null, 0, true), moved)).toBe('g1');
    expect(seatGroupId(device('a', 's9', 0, true), moved)).toBe('g1');
  });

  it('sends a device that comes back to the group of the seat it holds, waiting or let in, and to none without a seat', () => {
    const moved = students.map((s) => (s.id === 's1' ? { ...s, groupId: 'g2' } : s));
    expect(returnGroupId(device('a', 's1', 0, true), students)).toBe('g1');
    expect(returnGroupId(device('a', 's1', 0, false), students)).toBe('g1');
    expect(returnGroupId(device('a', 's1', 0, true), moved)).toBe('g2');
    expect(returnGroupId(device('a', null, 0, true), moved)).toBe('g1');
    expect(returnGroupId(null, students)).toBeNull();
  });

  it('lands a device that types a class code on its seat, live or ended, else on the choices of a live class or the ended message', () => {
    const live = { id: 'x', status: 'live' } as Session;
    const ended = { id: 'x', status: 'ended' } as Session;
    expect(joinLanding(live, device('a', 's1', 0, true), students)).toEqual({ to: 'group', groupId: 'g1' });
    expect(joinLanding(ended, device('a', 's1', 0, true), students)).toEqual({ to: 'group', groupId: 'g1' });
    expect(joinLanding(ended, device('a', 's1', 0, false), students)).toEqual({ to: 'group', groupId: 'g1' });
    expect(joinLanding(live, null, students)).toEqual({ to: 'choose' });
    expect(joinLanding(ended, null, students)).toEqual({ to: 'ended' });
  });

  it('opens the page of the group the seat joined, or the one her student was moved to', () => {
    const moved = students.map((s) => (s.id === 's1' ? { ...s, groupId: 'g2' } : s));
    expect(isSeatOfGroupPage(device('a', 's1', 0, true), 'g1', moved)).toBe(true);
    expect(isSeatOfGroupPage(device('a', 's1', 0, true), 'g2', moved)).toBe(true);
    expect(isSeatOfGroupPage(device('a', 's2', 0, true), 'g2', moved)).toBe(false);
  });

  it('finds the other devices holding the name of a seat, waiting or admitted', () => {
    const copies = [device('a', 's1', 1, false), device('b', 's1', 2, true), device('c', 's1', 3, false), device('d', 's2', 4, false), device('e', null, 5, true), device('f', null, 6, true)];
    expect(seatsDisplacedBy(copies, copies[0]).map((p) => p.id)).toEqual(['b', 'c']);
    expect(seatsDisplacedBy(copies, copies[3])).toEqual([]);
    expect(seatsDisplacedBy(copies, copies[4])).toEqual([]);
    expect(isNameHeldElsewhere(copies, copies[0])).toBe(true);
    expect(isNameHeldElsewhere(copies, copies[3])).toBe(false);
    expect(isNameHeldElsewhere(copies, copies[4])).toBe(false);
  });

  it('gives every seat a stable two-digit request number, and two seats a different one', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `seat${i}-${(i * 7919).toString(16)}`);
    for (const id of ids) {
      const number = requestNumber(device(id, 's1', 1, false));
      expect(number).toBeGreaterThanOrEqual(10);
      expect(number).toBeLessThanOrEqual(99);
      expect(requestNumber(device(id, 's2', 9, true))).toBe(number);
    }
    expect(new Set(ids.map((id) => requestNumber(device(id, null, 1, false)))).size).toBeGreaterThan(50);
    expect(requestNumber(device('a', 's1', 1, false))).not.toBe(requestNumber(device('b', 's1', 2, false)));
  });

  it('shows a request number only on a waiting seat whose name another device holds or asks for', () => {
    const copies = [device('a', 's1', 1, false), device('b', 's1', 2, true), device('c', 's1', 3, false), device('d', 's2', 4, false), device('e', null, 5, false), device('f', null, 6, false)];
    expect(contestedRequestNumber(copies, copies[0])).toBe(requestNumber(copies[0]));
    expect(contestedRequestNumber(copies, copies[2])).toBe(requestNumber(copies[2]));
    expect(contestedRequestNumber(copies, copies[1])).toBeNull();
    expect(contestedRequestNumber(copies, copies[3])).toBeNull();
    expect(contestedRequestNumber(copies, copies[4])).toBeNull();
  });

  it('tells a named seat that was only waiting its name was taken, and any other lost seat that it was taken out', () => {
    expect(seatLoss(device('a', 's1', 1, false))).toBe('name-taken');
    expect(seatLoss(device('a', 's1', 1, true))).toBe('removed');
    expect(seatLoss(device('a', null, 1, false))).toBe('removed');
    expect(seatLoss(device('a', null, 1, true))).toBe('removed');
  });

  it('names the students held by devices other than this one', () => {
    expect([...namesHeldByOthers(devices, 'a')].sort()).toEqual(['s2', 's3']);
    expect([...namesHeldByOthers(devices, null)].sort()).toEqual(['s1', 's2', 's3']);
  });

  it('picks the waiting seats of the students whose cards were seen', () => {
    expect(seatsForCards(devices, ['s1', 's3', 's7']).map((p) => p.id)).toEqual(['a']);
    expect(seatsForCards(devices, [])).toEqual([]);
  });

  it('leaves every seat whose name is asked for twice or held by an admitted device to the teacher, whatever the card says', () => {
    const twins = [device('a', 's1', 1, false), device('b', 's1', 2, false), device('c', 's2', 3, false), device('d', 's2', 4, true), device('e', 's3', 5, false)];
    expect(seatsForCards(twins, ['s1', 's2'])).toEqual([]);
    expect(seatsForCards(twins, ['s1', 's2', 's3']).map((p) => p.id)).toEqual(['e']);
    expect(seatsNeedingTap(twins).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('never lets a card admit a shared device', () => {
    expect(seatsForCards([device('a', null, 1, false)], ['s1'])).toEqual([]);
  });
});

describe('bulk admission', () => {
  const device = (id: string, studentId: string | null, joinedAt: number, admitted: boolean): Participant => ({
    id, sessionId: 'x', groupId: 'g1', studentId, joinedAt, admitted,
  });

  it('picks every waiting seat whose name no other device holds or asks for, oldest first', () => {
    const seats = [
      device('a', 's1', 3, false),
      device('b', 's2', 1, false),
      device('c', null, 2, false),
      device('d', 's3', 4, false),
      device('e', 's3', 5, false),
      device('f', 's4', 6, true),
      device('g', 's4', 7, false),
      device('h', 's5', 8, true),
    ];
    expect(seatsForBulkAdmission(seats).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('picks nothing when nobody waits', () => {
    expect(seatsForBulkAdmission([device('a', 's1', 1, true)])).toEqual([]);
  });
});

describe('session state', () => {
  it('knows whether a class is live', () => {
    expect(isLive(session)).toBe(true);
    expect(isLive({ ...session, status: 'ended' })).toBe(false);
  });
});

describe('starting a class and removing what it uses', () => {
  const lessonRow = { id: 'l1' } as Lesson;
  const schoolClass: SchoolClass = { id: 'c1', name: '11-3', order: 1 };
  const teacher: Teacher = { id: 't1', name: 'أ. هدى', order: 1 };

  it('starts only from a stored lesson, class and teacher, taking their names', () => {
    expect(sessionBasis(lessonRow, schoolClass, teacher, groups)).toEqual({ lessonId: 'l1', classId: 'c1', className: '11-3', teacherId: 't1', teacherName: 'أ. هدى' });
    expect(sessionBasis(null, schoolClass, teacher, groups)).toBeNull();
    expect(sessionBasis(lessonRow, null, teacher, groups)).toBeNull();
    expect(sessionBasis(lessonRow, schoolClass, null, groups)).toBeNull();
  });

  it('refuses to start a class that has no group', () => {
    expect(sessionBasis(lessonRow, schoolClass, teacher, [])).toBeNull();
  });

  it('keeps a class and a teacher that a live class uses', () => {
    const live = [session, { ...session, id: 'y', classId: 'c2', teacherId: 't2', status: 'ended' as const }];
    expect(canRemoveClass('c1', live)).toBe(false);
    expect(canRemoveTeacher('t1', live)).toBe(false);
    expect(canRemoveClass('c2', live)).toBe(true);
    expect(canRemoveTeacher('t2', live)).toBe(true);
  });

  it('keeps a lesson that a live class uses', () => {
    const live = [session, { ...session, id: 'y', lessonId: 'l2', status: 'ended' as const }];
    expect(canRemoveLesson('l1', live)).toBe(false);
    expect(canRemoveLesson('l2', live)).toBe(true);
    expect(canRemoveLesson('l3', live)).toBe(true);
  });

  it('picks the only item of a list', () => {
    expect(onlyOne(['a'])).toBe('a');
    expect(onlyOne(['a', 'b'])).toBeNull();
    expect(onlyOne([])).toBeNull();
  });

  it('numbers the next item after the last and sorts by that number', () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder([{ order: 4 }, { order: 2 }])).toBe(5);
    expect(sortByOrder([{ order: 3 }, { order: 1 }]).map((item) => item.order)).toEqual([1, 3]);
  });
});

describe('which class a page shows', () => {
  const at = (code: string, startedAt: number, status: Session['status'] = 'live'): Session => ({ ...session, id: code, code, startedAt, status });
  const codeOf = (found: Session | null) => found?.code ?? null;

  it('lists live classes newest first', () => {
    expect(liveSessions([at('A', 1), at('B', 3), at('C', 2, 'ended')]).map((s) => s.code)).toEqual(['B', 'A']);
  });

  it('shows the class the address names, live or ended', () => {
    const all = [at('A', 1), at('B', 2, 'ended')];
    expect(codeOf(sessionForPage(all, 'B'))).toBe('B');
    expect(codeOf(sessionForPage(all, 'ZZZ'))).toBeNull();
  });

  it('without a code shows the only live class', () => {
    expect(codeOf(sessionForPage([at('A', 1), at('B', 2, 'ended')], undefined))).toBe('A');
  });

  it('without a code and none live shows the most recently started class', () => {
    expect(codeOf(sessionForPage([at('A', 1, 'ended'), at('B', 5, 'ended'), at('C', 3, 'ended')], undefined))).toBe('B');
    expect(sessionForPage([], undefined)).toBeNull();
  });

  it('without a code and several live shows none, so the visitor chooses', () => {
    expect(sessionForPage([at('A', 1), at('B', 2)], undefined)).toBeNull();
  });

  it('the teacher\'s session page shows only a live class by its code, never one picked for her', () => {
    const all = [at('A', 1), at('B', 2, 'ended')];
    expect(liveSessionForPage(all, undefined)).toBeNull();
    expect(codeOf(liveSessionForPage(all, 'A'))).toBe('A');
    expect(liveSessionForPage(all, 'B')).toBeNull();
    expect(liveSessionForPage([at('B', 2, 'ended')], undefined)).toBeNull();
    expect(liveSessionForPage([at('A', 1), at('C', 3)], undefined)).toBeNull();
  });

  it('keeps the ten classes that ended last', () => {
    const ended = Array.from({ length: 12 }, (_, i) => at(`E${i}`, i, 'ended'));
    const kept = recentlyEnded([at('L', 99), ...ended]).map((s) => s.code);
    expect(kept).toHaveLength(10);
    expect(kept[0]).toBe('E11');
    expect(kept).not.toContain('L');
  });

  it('never gives a join code that a stored class already has', () => {
    const codes = ['AAA', 'BBB', 'CCC'];
    const made = [...codes, 'DDD'];
    const stored = codes.map((code, i) => at(code, i));
    expect(newUniqueJoinCode(stored, () => made.shift()!)).toBe('DDD');
  });
});

describe('card lookup', () => {
  it('finds the student holding a card number', () => {
    expect(studentByCard(students, 4)?.id).toBe('s3');
    expect(studentByCard(students, 9)).toBeNull();
  });

  it('labels a seen card only when it belongs to a student', () => {
    const corners: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(cardLabel(students, { id: 4, corners })).toBe('4');
    expect(cardLabel(students, { id: 9, corners })).toBeNull();
  });

  it('finds a student by id, and none for a shared device or an unknown id', () => {
    expect(studentById(students, 's3')?.cardNumber).toBe(4);
    expect(studentById(students, null)).toBeNull();
    expect(studentById(students, 'nobody')).toBeNull();
  });

  it('turns every sighting into the same reading', () => {
    const corners: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(presenceReadings([{ id: 3, corners }, { id: 5, corners: [...corners].reverse() }])).toEqual([
      { cardNumber: 3, choice: 0 },
      { cardNumber: 5, choice: 0 },
    ]);
  });
});

describe('student report', () => {
  it('hides unrevealed verdicts and points', () => {
    const second: ChoiceSlide = { ...choice, id: 'q3' };
    const third: ChoiceSlide = { ...choice, id: 'q4' };
    const own: Lesson = { ...lesson, slides: [choice, second, third] };
    const revealed: Session = { ...session, reveals: { q1: { correctIndex: 1, explanation: '' } } };
    const given = [answer('q1', 'student', 's1', 1), answer('q3', 'student', 's1', 1)];
    const report = studentReport(own, revealed, everyone, students[0], given);
    expect(report.results.map((r) => r.verdict)).toEqual(['correct', 'pending', 'none']);
    expect(report.points).toBe(choice.points);
  });
});

describe('pearls', () => {
  const pearls = (score: number, max: number) => pearlsEarned({ groupId: 'g1', score, max });

  it('turns the share of the maximum score into whole pearls', () => {
    expect(pearls(0, 12)).toBe(0);
    expect(pearls(12, 12)).toBe(PEARL_COUNT);
    expect(pearls(6, 12)).toBe(4);
  });

  it('has no pearls when nothing can be scored', () => {
    expect(pearls(0, 0)).toBe(0);
  });
});

describe('digits', () => {
  it('turns Arabic-Indic and Eastern Arabic-Indic digits into 0-9 and leaves the rest', () => {
    expect(toAsciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(toAsciiDigits('ab 12 ٣')).toBe('ab 12 3');
  });
});

describe('class list format', () => {
  const entriesOf = (text: string) => {
    const result = parseRosterText(text);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.entries;
  };
  const issuesOf = (text: string) => {
    const result = parseRosterText(text);
    return result.ok ? [] : result.issues;
  };

  it('reads tab, comma, Arabic comma, semicolon and bar separated lines', () => {
    const text = '1\tسلمى\tأ\n2,نور,ب\n3،هند،أ\n4;دعاء;ب\n5|ليلى|أ';
    expect(entriesOf(text).map((e) => [e.cardNumber, e.name, e.groupName])).toEqual([
      [1, 'سلمى', 'أ'], [2, 'نور', 'ب'], [3, 'هند', 'أ'], [4, 'دعاء', 'ب'], [5, 'ليلى', 'أ'],
    ]);
  });

  it('trims cells, ignores blank lines, comments, a header row, a BOM and Windows line ends', () => {
    const text = '\uFEFF# comment\r\nرقم\tالاسم\tالمجموعة\r\n\r\n 7 \t سلمى \t أ \r\n# more\r\n';
    expect(entriesOf(text)).toEqual([{ cardNumber: 7, name: 'سلمى', groupName: 'أ' }]);
  });

  it('keeps commas inside a name when the line uses tabs', () => {
    expect(entriesOf('1\tأحمد، سلمى\tأ')[0].name).toBe('أحمد، سلمى');
  });

  it('reads card numbers written in Arabic digits', () => {
    expect(entriesOf('٩٠١\ta\tg\n۹۰۲\tb\tg').map((e) => e.cardNumber)).toEqual([901, 902]);
  });

  it('only treats the first data line as a header', () => {
    expect(issuesOf('1\ta\tg\nx\tb\tg')).toEqual([{ code: 'bad-card-number', line: 2 }]);
  });

  it('reports every problem with its line number', () => {
    const text = ['# top', '1\ta\tg', '1\tb\tg', 'x\tc\tg', '0\td\tg', '1000\te\tg', '1.5\tf\tg', '5\t\tg', '6\tg\t', 'only two\tcells', '7\ta\tb\tc'].join('\n');
    expect(issuesOf(text)).toEqual([
      { code: 'duplicate-card-number', line: 3 },
      { code: 'bad-card-number', line: 4 },
      { code: 'bad-card-number', line: 5 },
      { code: 'bad-card-number', line: 6 },
      { code: 'bad-card-number', line: 7 },
      { code: 'empty-name', line: 8 },
      { code: 'empty-group', line: 9 },
      { code: 'wrong-cell-count', line: 10 },
      { code: 'wrong-cell-count', line: 11 },
    ]);
  });

  it('refuses a text with no students', () => {
    expect(issuesOf('')).toEqual([{ code: 'no-students', line: null }]);
    expect(issuesOf('# only\nرقم\tاسم\tمجموعة')).toEqual([{ code: 'no-students', line: null }]);
  });

  it('exports in card-number order and reads its own output back', () => {
    const text = exportRosterText(groups, [students[1], students[0]], 'رقم\tاسم\tمجموعة');
    expect(text.split('\n')[0]).toBe('# رقم\tاسم\tمجموعة');
    expect(text.split('\n')[1]).toBe('1\tسلمى أحمد\tأ');
    const back = entriesOf(text);
    expect(back).toEqual(
      [students[0], students[1]].map((s): RosterEntry => ({ cardNumber: s.cardNumber, name: s.name, groupName: 'أ' })),
    );
  });

  describe('applying', () => {
    const entries: RosterEntry[] = [
      { cardNumber: 1, name: 'سلمى الجديدة', groupName: 'ب' },
      { cardNumber: 901, name: 'جديدة', groupName: 'ج' },
    ];

    it('merges: matches groups by name and students by card, creates the rest, removes nobody', () => {
      const result = applyRoster(entries, 'c1', groups, students, 'merge');
      expect(result.groups.map((g) => g.name)).toEqual(['أ', 'ب', 'ج']);
      expect(result.groups[2].order).toBe(3);
      expect(result.students).toHaveLength(students.length + 1);
      const moved = result.students.find((s) => s.cardNumber === 1);
      expect(moved).toMatchObject({ id: 's1', name: 'سلمى الجديدة', groupId: 'g2' });
      expect(result.students.find((s) => s.cardNumber === 901)?.groupId).toBe(result.groups[2].id);
      expect(result.changes).toEqual({ studentsAdded: 1, studentsUpdated: 1, studentsRemoved: 0, groupsAdded: 1, groupsRemoved: 0 });
    });

    it('does not count an unchanged student as updated', () => {
      const same: RosterEntry[] = [{ cardNumber: 1, name: 'سلمى أحمد', groupName: 'أ' }];
      expect(applyRoster(same, 'c1', groups, students, 'merge').changes.studentsUpdated).toBe(0);
    });

    it('replaces: the result is exactly the list, staying students keep their ids', () => {
      const result = applyRoster(entries, 'c1', groups, students, 'replace');
      expect(result.students.map((s) => s.cardNumber).sort((a, b) => a - b)).toEqual([1, 901]);
      expect(result.students.find((s) => s.cardNumber === 1)?.id).toBe('s1');
      expect(result.groups.map((g) => g.name)).toEqual(['ب', 'ج']);
      expect(result.changes.studentsRemoved).toBe(students.length - 1);
      expect(result.changes.groupsAdded).toBe(1);
      expect(result.changes.groupsRemoved).toBe(1);
    });
  });
});

describe('who is here', () => {
  const none = everyone;
  const roll = (present: string[]): AttendedRoster => ({ ...everyone, present });

  it('counts everyone while no roll was taken', () => {
    expect(rollTaken(none)).toBe(false);
    expect(presentStudents(none).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(isPresent(none, 's2')).toBe(true);
    expect(isOnRoll(none, 's2')).toBe(false);
    expect(presentGroups(none).map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('counts only the students on the roll once one was taken', () => {
    const taken = roll(['s1', 's3']);
    expect(rollTaken(taken)).toBe(true);
    expect(presentStudents(taken).map((s) => s.id)).toEqual(['s1', 's3']);
    expect(isPresent(taken, 's2')).toBe(false);
    expect(isOnRoll(taken, 's1')).toBe(true);
    expect(presentGroups(roll(['s1', 's2'])).map((g) => g.id)).toEqual(['g1']);
  });

  it('starts a roll from an empty list when a card is seen or a device is let in', () => {
    expect(joinRoll(none, ['s2']).present).toEqual(['s2']);
    expect(joinRoll(none, ['s2', 's2']).present).toEqual(['s2']);
  });

  it('adds to a roll that exists without duplicates', () => {
    expect(joinRoll(roll(['s1']), ['s1', 's3']).present).toEqual(['s1', 's3']);
  });

  it('does not start a roll for an answer or a hand mark, and adds to one that exists', () => {
    expect(addToRoll(none, ['s1'])).toBe(none);
    expect(addToRoll(roll(['s1']), ['s2']).present).toEqual(['s1', 's2']);
  });

  it('starts a roll from everyone minus her when she is marked absent, and removes her from one that exists', () => {
    expect(markAbsent(none, 's2')!.present).toEqual(['s1', 's3']);
    expect(markAbsent(roll(['s1', 's2']), 's2')!.present).toEqual(['s1']);
  });

  it('keeps only students of the roster on the roll', () => {
    expect(joinRoll(none, ['s9'])).toBe(none);
    expect(joinRoll(none, ['s9', 's1']).present).toEqual(['s1']);
    expect(addToRoll(roll(['s1']), ['s9']).present).toEqual(['s1']);
    expect(markAbsent(none, 's9')).toBeNull();
  });

  it('tallies an individual question over the present students', () => {
    const given = [{ ...answerOf('s1') }];
    expect(tallyAnswerers(choice, none, [], given)).toMatchObject({ answered: 1, expected: 3 });
    const taken = roll(['s1', 's2']);
    const tally = tallyAnswerers(choice, taken, [], given);
    expect(tally).toMatchObject({ answered: 1, expected: 2 });
    expect(tally.waiting.map((w) => w.name)).toEqual(['نور خالد']);
  });

  it('counts only the answers of present students', () => {
    expect(tallyAnswerers(choice, roll(['s2']), [], [answerOf('s1')])).toMatchObject({ answered: 0, expected: 1 });
  });

  it('tallies a group question over the groups with a present member or that already answered', () => {
    const given: Answer[] = [{ id: 'a', sessionId: 'x', slideId: 'q2', subject: { kind: 'group', id: 'g1' }, value: 'ن', source: 'device', at: 0 }];
    expect(tallyAnswerers(groupText, none, [], given)).toMatchObject({ answered: 1, expected: 2 });
    const taken = roll(['s1']);
    expect(tallyAnswerers(groupText, taken, [], given)).toMatchObject({ answered: 1, expected: 1, waiting: [] });
    expect(tallyAnswerers(groupText, roll(['s3']), [], given)).toMatchObject({ answered: 1, expected: 2, waiting: [{ id: 'g2', name: 'ب' }] });
  });

  function answerOf(studentId: string): Answer {
    return { id: studentId, sessionId: 'x', slideId: 'q1', subject: { kind: 'student', id: studentId }, value: 1, source: 'device', at: 0 };
  }

  describe('in the scores', () => {
    const keys = teacherKeys(session);
    const given = [answerOf('s1'), { ...answerOf('s2'), value: 0 }];

    it('averages a group over its present members only', () => {
      expect(scoreboard(lesson, everyone, given, keys)[0].score).toBe(1);
      expect(scoreboard(lesson, roll(['s1', 's3']), given, keys)[0].score).toBe(2);
    });

    it('gives a group with no present member its group points only', () => {
      const shared: Answer = { id: 'g', sessionId: 'x', slideId: 'q2', subject: { kind: 'group', id: 'g1' }, value: 'ن', source: 'device', at: 0 };
      expect(scoreboard(lesson, roll(['s3']), [...given, shared], keys)[0].score).toBe(3);
    });

    it('keeps an absent student answers on record in the monitor and marks her absent', () => {
      const [first] = buildMonitor(lesson, session, markAbsent(everyone, 's1')!, given, [], keys);
      expect(first.rows.map((r) => [r.student.id, r.present, r.points])).toEqual([['s1', false, 2], ['s2', true, 0]]);
    });
  });
});

describe('the group a device answers for', () => {
  it('follows a student the teacher moved, while a shared device keeps the group it joined', () => {
    const seat: Participant = { id: 'p', sessionId: 'x', groupId: 'g1', studentId: 's1', joinedAt: 0, admitted: true };
    const moved = students.map((s) => (s.id === 's1' ? { ...s, groupId: 'g2' } : s));
    expect(seatAnswerer(seat, students)).toEqual({ groupId: 'g1', studentId: 's1' });
    expect(seatAnswerer(seat, moved)).toEqual({ groupId: 'g2', studentId: 's1' });
    expect(seatAnswerer({ ...seat, studentId: null }, moved)).toEqual({ groupId: 'g1', studentId: null });
    expect(subjectFor(groupText, seatAnswerer(seat, moved))).toEqual({ kind: 'group', id: 'g2' });
  });

  it('finds a group by its id', () => {
    expect(groupById(groups, 'g2')?.name).toBe('ب');
    expect(groupById(groups, 'g9')).toBeNull();
  });
});

describe('when a page takes the code of the class it shows', () => {
  const ended: Session = { ...session, status: 'ended' };

  it('takes the code of a running class only when the address has none', () => {
    expect(codeToFillIn(session, undefined)).toBe('ABC234');
    expect(codeToFillIn(session, 'ABC234')).toBeNull();
  });

  it('leaves the address alone for an ended class, so the page follows one that starts later', () => {
    expect(codeToFillIn(ended, undefined)).toBeNull();
    expect(codeToFillIn(null, undefined)).toBeNull();
    const later: Session = { ...session, id: 'y', code: 'LATER2', startedAt: 10 };
    expect(sessionForPage([ended], undefined)).toBe(ended);
    expect(sessionForPage([ended, later], undefined)).toBe(later);
  });
});

describe('what the roll-call scan changes', () => {
  const waiting: Participant = { id: 'w', sessionId: 'x', groupId: 'g1', studentId: 's1', joinedAt: 0, admitted: false };
  const taken: AttendedRoster = { ...everyone, present: ['s1'] };

  it('returns the same roster when nobody is added to the roll or taken off it', () => {
    expect(joinRoll(taken, ['s1'])).toBe(taken);
    expect(joinRoll(taken, ['s1', 's9'])).toBe(taken);
    expect(addToRoll(taken, ['s1'])).toBe(taken);
    expect(markAbsent(taken, 's2')).toBe(taken);
    expect(joinRoll(taken, ['s2'])).not.toBe(taken);
  });

  it('changes something only for a student who is not on the roll or whose waiting device a card can let in', () => {
    expect(sightingChangesAnything(taken, [], 's2')).toBe(true);
    expect(sightingChangesAnything(taken, [], 's1')).toBe(false);
    expect(sightingChangesAnything(taken, [waiting], 's1')).toBe(true);
  });

  it('changes nothing for a waiting device whose name another device holds, as a card can never let it in', () => {
    const other: Participant = { ...waiting, id: 'o', admitted: true };
    expect(sightingChangesAnything(taken, [waiting, other], 's1')).toBe(false);
  });
});

describe('the groups a group question counts', () => {
  const sharedTablet: Participant = { id: 't', sessionId: 'x', groupId: 'g2', studentId: null, joinedAt: 0, admitted: true };
  const onlyG1: AttendedRoster = { ...everyone, present: ['s1'] };
  const groupAnswer = (groupId: string): Answer => ({ id: groupId, sessionId: 'x', slideId: 'q2', subject: { kind: 'group', id: groupId }, value: 'ن', source: 'device', at: 0 });

  it('counts a group whose shared device was let in even though nobody of it is on the roll', () => {
    expect(countedGroups(onlyG1, [], new Set()).map((g) => g.id)).toEqual(['g1']);
    expect(countedGroups(onlyG1, [sharedTablet], new Set()).map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(tallyAnswerers(groupText, onlyG1, [sharedTablet], [])).toMatchObject({ answered: 0, expected: 2 });
  });

  it('does not count a group for a device still waiting', () => {
    expect(countedGroups(onlyG1, [{ ...sharedTablet, admitted: false }], new Set()).map((g) => g.id)).toEqual(['g1']);
  });

  it('counts a group that has answered, and leaves individual questions unchanged', () => {
    expect(tallyAnswerers(groupText, onlyG1, [], [groupAnswer('g2')])).toMatchObject({ answered: 1, expected: 2 });
    expect(tallyAnswerers(choice, onlyG1, [sharedTablet], [])).toMatchObject({ expected: 1 });
  });

  it('tallies the options over the same people the total counts', () => {
    const given = [answer('q1', 'student', 's1', 0), answer('q1', 'student', 's2', 0), answer('q1', 'student', 's3', 1)];
    expect(tallyChoices(choice, everyone, [], given)).toEqual([2, 1, 0]);
    expect(tallyChoices(choice, onlyG1, [], given)).toEqual([1, 0, 0]);
    const { answered } = tallyAnswerers(choice, onlyG1, [], given);
    expect(tallyChoices(choice, onlyG1, [], given).reduce((a, b) => a + b, 0)).toBe(answered);
  });

  it('tallies a group choice question over the groups that count, an answering group among them', () => {
    const groupChoice: ChoiceSlide = { ...choice, id: 'q3', scope: 'group' };
    const given = [answer('q3', 'group', 'g1', 0), answer('q3', 'group', 'g2', 1)];
    expect(tallyChoices(groupChoice, onlyG1, [], given)).toEqual([1, 1, 0]);
    expect(tallyChoices(groupChoice, onlyG1, [sharedTablet], given.slice(0, 1))).toEqual([1, 0, 0]);
  });
});

describe('who has answered the slide, group by group', () => {
  const sharedTablet: Participant = { id: 't', sessionId: 'x', groupId: 'g2', studentId: null, joinedAt: 0, admitted: true };
  const forGroup = (groupId: string): Answer => answer('q2', 'group', groupId, 'ن');
  const waitingOf = (statuses: ReturnType<typeof answerStatusByGroup>) =>
    statuses.flatMap((entry) => [...(entry.mark === 'waiting' ? [entry.group.id] : []), ...entry.students.filter((s) => s.mark === 'waiting').map((s) => s.student.id)]);
  const cases: { name: string; slide: ChoiceSlide | TextSlide; roster: AttendedRoster; participants: Participant[]; answers: Answer[] }[] = [
    { name: 'no roll taken', slide: choice, roster: everyone, participants: [], answers: [answer('q1', 'student', 's1', 0)] },
    { name: 'a roll with an absent student', slide: choice, roster: { ...everyone, present: ['s1', 's3'] }, participants: [], answers: [answer('q1', 'student', 's1', 0), answer('q1', 'student', 's2', 1)] },
    { name: 'a group question with no roll', slide: groupText, roster: everyone, participants: [], answers: [forGroup('g1')] },
    { name: 'a group question and a roll', slide: groupText, roster: { ...everyone, present: ['s1'] }, participants: [], answers: [] },
    { name: 'a shared group device', slide: groupText, roster: { ...everyone, present: ['s1'] }, participants: [sharedTablet], answers: [] },
    { name: 'an individual question and a shared group device', slide: choice, roster: { ...everyone, present: ['s1'] }, participants: [sharedTablet], answers: [] },
  ];

  it.each(cases)('has as many waiting as the tally says: $name', ({ slide, roster, participants, answers }) => {
    const tally = tallyAnswerers(slide, roster, participants, answers);
    const waiting = waitingOf(answerStatusByGroup(slide, roster, participants, answers));
    expect(waiting.sort()).toEqual(tally.waiting.map(({ id }) => id).sort());
  });

  it('marks each student of an individual question, and an absent one as absent, not as waiting', () => {
    const statuses = answerStatusByGroup(choice, { ...everyone, present: ['s1', 's3'] }, [], [answer('q1', 'student', 's1', 0), answer('q1', 'student', 's2', 1)]);
    expect(statuses.map((entry) => entry.group.id)).toEqual(['g1', 'g2']);
    expect(statuses[0].mark).toBeNull();
    expect(statuses[0].students.map((s) => [s.student.id, s.present, s.mark])).toEqual([['s1', true, 'answered'], ['s2', false, null]]);
    expect(statuses[1].students.map((s) => [s.student.id, s.present, s.mark])).toEqual([['s3', true, 'waiting']]);
  });

  it('marks the groups of a group question and leaves the students unmarked', () => {
    const statuses = answerStatusByGroup(groupText, everyone, [], [forGroup('g1')]);
    expect(statuses.map((entry) => entry.mark)).toEqual(['answered', 'waiting']);
    expect(statuses.flatMap((entry) => entry.students.map((s) => s.mark))).toEqual([null, null, null]);
  });

  it('leaves a group nobody counts unmarked, and counts one with a shared device', () => {
    const onlyG1 = { ...everyone, present: ['s1'] };
    expect(answerStatusByGroup(groupText, onlyG1, [], []).map((entry) => entry.mark)).toEqual(['waiting', null]);
    expect(answerStatusByGroup(groupText, onlyG1, [sharedTablet], []).map((entry) => entry.mark)).toEqual(['waiting', 'waiting']);
  });

  it('marks no one on a slide that is not a question or when there is no slide', () => {
    const content = { id: 'c', kind: 'content', title: 'ع', tag: '', body: '' } as unknown as Lesson['slides'][number];
    for (const slide of [content, undefined]) {
      const statuses = answerStatusByGroup(slide, everyone, [], []);
      expect([...statuses.map((entry) => entry.mark), ...statuses.flatMap((entry) => entry.students.map((s) => s.mark))].every((mark) => mark === null)).toBe(true);
    }
  });

  it('lists students in card order and every student, absent or not', () => {
    const shuffled: AttendedRoster = { ...everyone, students: [students[1], students[0], students[2]] };
    expect(answerStatusByGroup(choice, shuffled, [], [])[0].students.map((s) => s.student.id)).toEqual(['s1', 's2']);
  });
});

describe('cleaning typed text', () => {
  it('refuses a blank name and trims the rest', () => {
    expect(cleanName('  11-4 ')).toBe('11-4');
    expect(cleanName('   ')).toBeNull();
  });

  it('cuts a message to its limit and refuses a blank one', () => {
    expect(cleanMessage('  hello ')).toBe('hello');
    expect(cleanMessage('')).toBeNull();
    expect(cleanMessage('x'.repeat(MAX_MESSAGE_LENGTH + 50))).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe('whether a class can start', () => {
  it('needs at least one group', () => {
    expect(hasGroupsToStart(groups)).toBe(true);
    expect(hasGroupsToStart([])).toBe(false);
  });
});

describe('engagement', () => {
  const individual = (id: string): ChoiceSlide => ({ ...choice, id });
  const lessonOf = (count: number): Lesson => ({ ...lesson, slides: [...Array.from({ length: count }, (_, i) => individual(`i${i}`)), groupText] });
  const given = (studentId: string, slideIds: string[]): Answer[] => slideIds.map((slideId) => answer(slideId, 'student', studentId, 0));
  const ended: Session = { ...session, status: 'ended' };
  const revealing = (current: Session, ...slideIds: string[]): Session => ({
    ...current,
    reveals: { ...current.reveals, ...Object.fromEntries(slideIds.map((id) => [id, { correctIndex: 1, explanation: '' }])) },
  });
  const ids = (slides: { id: string }[]) => slides.map((slide) => slide.id);

  describe('which questions count', () => {
    const three = lessonOf(3);

    it('counts a question that still takes answers', () => {
      expect(ids(countingQuestions(session, three, everyone, []))).toEqual(['i0', 'i1', 'i2']);
      expect(possibleInteractions(session, three, everyone, [])).toBe(3);
    });

    it('counts a closed question a student answered, and not one nobody answered', () => {
      const closed = revealing(session, 'i0', 'i1');
      expect(ids(countingQuestions(closed, three, everyone, given('s2', ['i0'])))).toEqual(['i0', 'i2']);
      expect(ids(countingQuestions(revealing(ended, 'i0'), three, everyone, given('s2', ['i1'])))).toEqual(['i1']);
    });

    it('never counts a group question, and counts an individual one only once an answer, even the shared device\'s, stands for a present student', () => {
      expect(ids(countingQuestions(session, three, everyone, [answer('q2', 'group', 'g1', 'ن')]))).toEqual(['i0', 'i1', 'i2']);
      expect(ids(countingQuestions(ended, three, everyone, [answer('q2', 'group', 'g1', 'ن')]))).toEqual([]);
      expect(ids(countingQuestions(ended, three, everyone, [answer('i0', 'group', 'g1', 0)]))).toEqual(['i0']);
    });

    it('counts nothing in an ended class where nobody answered', () => {
      expect(possibleInteractions(ended, three, everyone, [])).toBe(0);
    });
  });

  it('asks for all but two counting questions by default, never below zero', () => {
    expect([0, 1, 2, 3, 5].map((count) => minInteractions(session, lessonOf(count), everyone, []))).toEqual([0, 0, 0, 1, 3]);
  });

  it('counts an individual question in what she answered or her own group\'s shared device did, never in the group questions or another group\'s answer', () => {
    expect(interactionsOf(lessonOf(3), everyone, [...given('s1', ['i0', 'i2']), answer('q2', 'group', 'g1', 'ن')], 's1')).toBe(2);
    expect(interactionsOf(lessonOf(3), everyone, [answer('i0', 'group', 'g1', 0)], 's1')).toBe(1);
    expect(interactionsOf(lessonOf(3), everyone, [answer('i0', 'group', 'g2', 0)], 's1')).toBe(0);
  });

  it('does not count a question answered only by a shared device whose group nobody on the roll belongs to, and leaves the default minimum alone', () => {
    const five = lessonOf(5);
    const roll = markAbsent(everyone, 's3')!;
    const revealedAll = revealing(session, 'i0', 'i1', 'i2', 'i3', 'i4');
    const sharedOfG2 = ['i0', 'i1', 'i2', 'i3', 'i4'].map((id) => answer(id, 'group', 'g2', 0));
    expect(roll.present).toEqual(['s1', 's2']);
    expect(ids(countingQuestions(revealedAll, five, roll, sharedOfG2))).toEqual([]);
    expect(possibleInteractions(revealedAll, five, roll, sharedOfG2)).toBe(0);
    expect(minInteractions(revealedAll, five, roll, sharedOfG2)).toBe(minInteractions(revealedAll, five, roll, []));
    expect(ids(countingQuestions(revealedAll, five, everyone, sharedOfG2))).toEqual(['i0', 'i1', 'i2', 'i3', 'i4']);
  });

  it('keeps the chosen minimum within zero and the counting questions', () => {
    const five = lessonOf(5);
    expect(minInteractions({ ...session, minInteractions: 4 }, five, everyone, [])).toBe(4);
    expect(minInteractions({ ...session, minInteractions: 9 }, five, everyone, [])).toBe(5);
    expect(minInteractions({ ...session, minInteractions: -3 }, five, everyone, [])).toBe(0);
  });

  describe('setting the minimum', () => {
    const five = lessonOf(5);

    it('stores a number within zero and the counting questions, rounded', () => {
      expect(withMinInteractions(session, five, everyone, [], 4).minInteractions).toBe(4);
      expect(withMinInteractions(session, five, everyone, [], 9).minInteractions).toBe(5);
      expect(withMinInteractions(session, five, everyone, [], -2).minInteractions).toBe(0);
      expect(withMinInteractions(session, five, everyone, [], 3.6).minInteractions).toBe(4);
    });

    it('refuses a value that is not a finite number and changes nothing', () => {
      const set = { ...session, minInteractions: 4 };
      for (const value of [NaN, Infinity, -Infinity]) expect(withMinInteractions(set, five, everyone, [], value)).toBe(set);
    });

    it('clears the stored setting when the value is the current default', () => {
      const set = { ...session, minInteractions: 4 };
      const cleared = withMinInteractions(set, five, everyone, [], 3);
      expect('minInteractions' in cleared).toBe(false);
      expect('minInteractions' in withMinInteractions(session, five, everyone, [], 3)).toBe(false);
    });

    it('lets the default go on following the counting questions after it was cleared', () => {
      const cleared = withMinInteractions({ ...session, minInteractions: 4 }, five, everyone, [], 3);
      expect(minInteractions(revealing(cleared, 'i0', 'i1'), five, everyone, [])).toBe(1);
    });
  });

  describe('who is unresponsive', () => {
    const five = lessonOf(5);
    const flagged = (current: Session, roster: AttendedRoster, answers: Answer[], studentId = 's1') => isUnresponsive(current, five, roster, answers, studentId);
    const wanting = (count: number): Session => ({ ...session, minInteractions: count });

    it('is off while the minimum can still be reached during a live class', () => {
      expect(flagged(session, everyone, [])).toBe(false);
      expect(flagged(session, everyone, given('s1', ['i0']))).toBe(false);
    });

    it('turns on once the minimum is out of reach in a live class', () => {
      const someoneAnswered = given('s2', ['i0']);
      expect(flagged(wanting(5), everyone, someoneAnswered)).toBe(false);
      expect(flagged(revealing(wanting(5), 'i0'), everyone, someoneAnswered)).toBe(true);
      expect(flagged(revealing(wanting(5), 'i0'), everyone, [...someoneAnswered, ...given('s1', ['i0'])])).toBe(false);
      expect(flagged(revealing(wanting(4), 'i0'), everyone, someoneAnswered)).toBe(false);
    });

    it('is not moved by a revealed question nobody answered', () => {
      const stored = wanting(4);
      const answers = given('s1', ['i1', 'i2', 'i3']);
      expect(flagged(stored, everyone, answers)).toBe(false);
      expect(flagged(revealing(stored, 'i0'), everyone, answers)).toBe(false);
      expect(flagged(revealing(stored, 'i0'), everyone, [], 's2')).toBe(false);
      expect(possibleInteractions(revealing(stored, 'i0'), five, everyone, answers)).toBe(4);
    });

    it('is exactly "answered fewer than the minimum" among the questions that counted once the class has ended', () => {
      const answers = [...given('s1', ['i0', 'i1']), ...given('s2', ['i2'])];
      expect(flagged({ ...ended, minInteractions: 3 }, everyone, answers)).toBe(true);
      expect(flagged({ ...ended, minInteractions: 2 }, everyone, answers)).toBe(false);
    });

    it('asks only for what the class got to when it ended early', () => {
      const eight = lessonOf(8);
      const bySomeone = given('s2', ['i0', 'i1', 'i2', 'i3']);
      expect(minInteractions(ended, eight, everyone, bySomeone)).toBe(2);
      const check = (answers: Answer[]) => isUnresponsive(ended, eight, everyone, [...bySomeone, ...answers], 's1');
      expect(check(given('s1', ['i0']))).toBe(true);
      expect(check(given('s1', ['i0', 'i3']))).toBe(false);
    });

    it('never flags an absent student, in a live class or an ended one, and flags her again once she is back', () => {
      const bySomeone = given('s2', ['i0', 'i1', 'i2', 'i3', 'i4']);
      const away = markAbsent(everyone, 's1')!;
      expect(flagged(ended, everyone, bySomeone)).toBe(true);
      expect(flagged(ended, away, bySomeone)).toBe(false);
      expect(flagged(revealing(wanting(5), 'i0'), away, given('s2', ['i0']))).toBe(false);
      expect(flagged(ended, joinRoll(away, ['s1']), bySomeone)).toBe(true);
    });
  });
});

describe('the kept record of an ended class', () => {
  const ended: Session = { ...session, status: 'ended', startedAt: 5 };
  const given = [answer('q1', 'student', 's1', 1), answer('q1', 'student', 's2', 0), answer('q2', 'group', 'g1', 'x')];

  it('keeps names, points, answers, presence and the group scores', () => {
    const roster = markAbsent(everyone, 's3')!;
    const record = classRecord(ended, lesson, roster, given);
    expect(record).toMatchObject({ id: 'x', classId: 'c1', startedAt: 5 });
    expect(record.students).toEqual([
      { studentId: 's1', name: 'سلمى أحمد', groupId: 'g1', present: true, answered: 1, points: 2, unresponsive: false },
      { studentId: 's2', name: 'نور خالد', groupId: 'g1', present: true, answered: 1, points: 0, unresponsive: false },
      { studentId: 's3', name: 'ريم يوسف', groupId: 'g2', present: false, answered: 0, points: 0, unresponsive: false },
    ]);
    expect(record.groups).toEqual([
      { groupId: 'g1', name: 'أ', score: 4, max: 5 },
      { groupId: 'g2', name: 'ب', score: 0, max: 5 },
    ]);
  });

  it('flags a present student who answered fewer than the minimum', () => {
    const record = classRecord({ ...ended, minInteractions: 1 }, lesson, everyone, given);
    expect(record.students.map((s) => s.unresponsive)).toEqual([false, false, true]);
  });

  it('counts no points for a student who is absent, even one who answered correctly', () => {
    const roster = markAbsent(everyone, 's1')!;
    const record = classRecord(ended, lesson, roster, given);
    expect(record.students.find((s) => s.studentId === 's1')).toMatchObject({ present: false, answered: 1, points: 0 });
    expect(record.groups[0].score).toBe(3);
  });

  it('follows the lesson it is given', () => {
    const kept = classRecord(ended, lesson, everyone, given);
    expect(kept.groups[0].max).toBe(5);
    expect(classRecord(ended, { ...lesson, slides: [] }, everyone, given).groups[0].max).toBe(0);
  });
});

describe('weeks and months on the school clock', () => {
  const qatar = (year: number, month: number, day: number, hour = 0, minute = 0) => Date.UTC(year, month - 1, day, hour, minute) - SCHOOL_UTC_OFFSET_MS;

  it('starts a week on Sunday at midnight Qatar time, which is Saturday 21:00 UTC', () => {
    const week = periodAt('week', Date.UTC(2026, 10, 7, 21, 0));
    expect(week.start).toBe(Date.UTC(2026, 10, 7, 21, 0));
    expect(week.end - week.start).toBe(7 * 24 * 3600 * 1000);
    expect(periodAt('week', Date.UTC(2026, 10, 7, 20, 59)).end).toBe(week.start);
  });

  it('ends a week on Saturday at 23:59 Qatar time', () => {
    const week = periodAt('week', qatar(2026, 11, 11, 10));
    expect(periodDates(week)).toEqual({ first: { year: 2026, month: 11, day: 8 }, last: { year: 2026, month: 11, day: 14 } });
    expect(inPeriod(week, qatar(2026, 11, 14, 23, 59))).toBe(true);
    expect(inPeriod(week, qatar(2026, 11, 15))).toBe(false);
    expect(inPeriod(week, qatar(2026, 11, 8))).toBe(true);
    expect(inPeriod(week, qatar(2026, 11, 7, 23, 59))).toBe(false);
  });

  it('names a week that spans two years', () => {
    expect(periodDates(periodAt('week', qatar(2027, 1, 1)))).toEqual({ first: { year: 2026, month: 12, day: 27 }, last: { year: 2027, month: 1, day: 2 } });
  });

  it('runs a month from its first day to the next, across the new year and in a leap February', () => {
    const december = periodAt('month', qatar(2026, 12, 31, 23, 59));
    expect(december.end).toBe(qatar(2027, 1, 1));
    expect(periodDates(shiftPeriod(december, 1))).toEqual({ first: { year: 2027, month: 1, day: 1 }, last: { year: 2027, month: 1, day: 31 } });
    expect(periodDates(periodAt('month', qatar(2028, 2, 10))).last).toEqual({ year: 2028, month: 2, day: 29 });
    expect(periodDates(periodAt('month', qatar(2027, 2, 10))).last).toEqual({ year: 2027, month: 2, day: 28 });
  });

  it('reads the month on the school clock, not on UTC', () => {
    expect(periodAt('month', Date.UTC(2026, 10, 30, 21, 0)).start).toBe(qatar(2026, 12, 1));
  });

  it('shifts a month from 31 January without skipping February, and back', () => {
    const january = periodAt('month', qatar(2026, 1, 31));
    const february = shiftPeriod(january, 1);
    expect(periodDates(february)).toEqual({ first: { year: 2026, month: 2, day: 1 }, last: { year: 2026, month: 2, day: 28 } });
    expect(shiftPeriod(february, -1)).toEqual(january);
  });

  it('shifts a week by whole weeks', () => {
    const week = periodAt('week', qatar(2026, 11, 11));
    expect(shiftPeriod(week, -1).end).toBe(week.start);
    expect(shiftPeriod(week, 2).start).toBe(week.end + 7 * 24 * 3600 * 1000);
  });

  it('includes the start of a period and excludes its end', () => {
    const month = periodAt('month', qatar(2026, 11, 11));
    expect(inPeriod(month, month.start)).toBe(true);
    expect(inPeriod(month, month.end - 1)).toBe(true);
    expect(inPeriod(month, month.end)).toBe(false);
    expect(inPeriod(month, month.start - 1)).toBe(false);
  });
});

describe('standings over a period', () => {
  const period = { kind: 'week' as const, start: 100, end: 200 };
  const listed: ClassRoster = { groups: [], students: [] };
  const entry = (studentId: string, groupId: string, points: number, extra: Partial<ClassRecord['students'][number]> = {}) => ({
    studentId, name: studentId, groupId, present: true, answered: 1, points, unresponsive: false, ...extra,
  });
  const record = (id: string, startedAt: number, studentRecords: ClassRecord['students'], scores: Record<string, number>, names: Record<string, string> = {}): ClassRecord => ({
    id, classId: 'c1', startedAt, students: studentRecords,
    groups: Object.entries(scores).map(([groupId, score]) => ({ groupId, name: names[groupId] ?? groupId, score, max: 5 })),
  });
  const heart = (sessionId: string, kind: 'student' | 'group', id: string): Reward => ({ id: `${sessionId}${kind}${id}${Math.random()}`, sessionId, target: { kind, id }, source: 'teacher', at: 999 });
  const first = record('a', 120, [entry('s1', 'g1', 2), entry('s2', 'g1', 1), entry('s3', 'g2', 3)], { g1: 1.5, g2: 3 });
  const second = record('b', 150, [entry('s1', 'g1', 3), entry('s2', 'g1', 0, { present: false })], { g1: 1.5 });
  const outside = record('c', 250, [entry('s1', 'g1', 9)], { g1: 9 });

  it('sums the records inside the period only', () => {
    const result = standings([first, second, outside], [], period, listed);
    expect(result.classes).toBe(2);
    expect(result.students.find((s) => s.studentId === 's1')).toMatchObject({ classes: 2, attended: 2, points: 5 });
    expect(result.groups.find((g) => g.groupId === 'g1')?.score).toBe(3);
  });

  it('sums what the students answered and what the groups could have scored', () => {
    const result = standings([first, second], [], period, listed);
    expect(result.students.find((s) => s.studentId === 's1')?.answered).toBe(2);
    expect(result.groups.find((g) => g.groupId === 'g1')?.max).toBe(10);
    expect(result.groups.find((g) => g.groupId === 'g2')?.max).toBe(5);
  });

  it('counts a student who was absent in one class as having been in the other', () => {
    expect(standings([first, second], [], period, listed).students.find((s) => s.studentId === 's2')).toMatchObject({ classes: 2, attended: 1, points: 1 });
  });

  it('counts how often she was flagged', () => {
    const flagged = record('d', 160, [entry('s1', 'g1', 0, { unresponsive: true })], { g1: 0 });
    expect(standings([first, flagged], [], period, listed).students.find((s) => s.studentId === 's1')?.unresponsive).toBe(1);
  });

  it('ranks students by points, then by name, and groups by score', () => {
    const result = standings([first, second], [], period, listed);
    expect(result.students.map((s) => s.studentId)).toEqual(['s1', 's3', 's2']);
    expect(result.groups.map((g) => g.groupId)).toEqual(['g1', 'g2']);
    const tied = standings([record('e', 120, [entry('b', 'g1', 1), entry('a', 'g1', 1)], { g1: 1 })], [], period, listed);
    expect(tied.students.map((s) => s.name)).toEqual(['a', 'b']);
  });

  it('adds up one decimal exactly', () => {
    const tenths = [0.1, 0.2].map((score, i) => record(`t${i}`, 120 + i, [], { g1: score }));
    expect(standings(tenths, [], period, listed).groups[0].score).toBe(0.3);
  });

  it('counts hearts given at any time to the sessions of the period, to students and to their group at that time', () => {
    const moved = record('m', 160, [entry('s1', 'g2', 0)], { g2: 0 });
    const rewards = [heart('a', 'student', 's1'), heart('a', 'group', 'g1'), heart('a', 'student', 's2'), heart('m', 'student', 's1'), heart('c', 'student', 's1')];
    const result = standings([first, moved, outside], rewards, period, listed);
    expect(result.students.find((s) => s.studentId === 's1')?.hearts).toBe(2);
    expect(result.groups.find((g) => g.groupId === 'g1')?.hearts).toBe(3);
    expect(result.groups.find((g) => g.groupId === 'g2')?.hearts).toBe(1);
  });

  it('keeps the newest record\'s name for a group or student no longer on the class list', () => {
    const renamed = record('r', 170, [entry('s1', 'g1', 0, { name: 'سلمى الجديدة' })], { g1: 0 }, { g1: 'الاسم الجديد' });
    const result = standings([renamed, first], [], period, listed);
    expect(result.groups.find((g) => g.groupId === 'g1')?.name).toBe('الاسم الجديد');
    expect(result.students.find((s) => s.studentId === 's1')?.name).toBe('سلمى الجديدة');
  });

  it('shows the name the class list has now, not a temporary name from one class', () => {
    const forToday = record('r', 170, [entry('s1', 'g1', 0, { name: 'اسم لليوم' })], { g1: 0 }, { g1: 'اسم مؤقت' });
    const current: ClassRoster = {
      groups: [{ id: 'g1', classId: 'c1', name: 'الاسم الدائم', color: '#000', order: 1 }],
      students: [{ id: 's1', name: 'سلمى الدائمة', cardNumber: 1, groupId: 'g1' }],
    };
    const result = standings([first, forToday], [], period, current);
    expect(result.groups.find((g) => g.groupId === 'g1')?.name).toBe('الاسم الدائم');
    expect(result.students.find((s) => s.studentId === 's1')?.name).toBe('سلمى الدائمة');
    expect(result.students.find((s) => s.studentId === 's2')?.name).toBe('s2');
  });

  it('picks one student\'s own line out of the results, without her unresponsive count', () => {
    const result = standings([first, second], [heart('a', 'student', 's1')], period, listed);
    const own = ownStanding(result, 's2');
    expect(own).toEqual({ classes: 2, attended: 1, points: 1, hearts: 0 });
    expect(ownStanding(result, 's1')).toEqual({ classes: 2, attended: 2, points: 5, hearts: 1 });
    expect(own).not.toHaveProperty('unresponsive');
  });

  it('gives a student none of the classes of the period lists, or a period without classes, a line of zeros', () => {
    expect(ownStanding(standings([first], [], period, listed), 's9')).toEqual({ classes: 0, attended: 0, points: 0, hearts: 0 });
    expect(ownStanding(standings([outside], [], period, listed), 's1')).toEqual({ classes: 0, attended: 0, points: 0, hearts: 0 });
  });

  it('picks the records of a period, oldest first', () => {
    expect(recordsIn([second, outside, first], period).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('is empty when no class ended in the period', () => {
    expect(standings([outside], [heart('c', 'student', 's1')], period, listed)).toEqual({ classes: 0, students: [], groups: [] });
  });
});

describe('moving through a list of options with the keyboard', () => {
  it('moves one option at a time and stops at the ends', () => {
    expect(movedIndex('ArrowDown', 0, 3)).toBe(1);
    expect(movedIndex('ArrowDown', 2, 3)).toBe(2);
    expect(movedIndex('ArrowUp', 1, 3)).toBe(0);
    expect(movedIndex('ArrowUp', 0, 3)).toBe(0);
  });

  it('starts from the first option when nothing is highlighted', () => {
    expect(movedIndex('ArrowDown', -1, 3)).toBe(0);
  });

  it('jumps to the first and last option with Home and End', () => {
    expect(movedIndex('Home', 2, 4)).toBe(0);
    expect(movedIndex('End', 0, 4)).toBe(3);
  });

  it('has nowhere to go in an empty list', () => {
    expect(movedIndex('ArrowDown', -1, 0)).toBe(-1);
  });

  it('moves ten options with PageDown and PageUp and stops at the ends', () => {
    expect(movedIndex('PageDown', 3, 30)).toBe(13);
    expect(movedIndex('PageDown', 25, 30)).toBe(29);
    expect(movedIndex('PageUp', 15, 30)).toBe(5);
    expect(movedIndex('PageUp', 4, 30)).toBe(0);
  });

  it('knows which keys move', () => {
    expect(isMoveKey('Home')).toBe(true);
    expect(isMoveKey('PageDown')).toBe(true);
    expect(isMoveKey('PageUp')).toBe(true);
    expect(isMoveKey('a')).toBe(false);
  });
});

describe('what a key does to a drop-down', () => {
  const press = (open: boolean, key: string, alt = false, selected = 2, active = 4, count = 30) => listKeyEffect(open, key, alt, selected, active, count);

  it('opens a closed list on the chosen option with Enter, Space and the arrows, and on the first or last with Home and End', () => {
    for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) expect(press(false, key)).toEqual({ type: 'open', index: 2 });
    expect(press(false, 'ArrowDown', false, -1)).toEqual({ type: 'open', index: 0 });
    expect(press(false, 'Home')).toEqual({ type: 'open', index: 0 });
    expect(press(false, 'End')).toEqual({ type: 'open', index: 29 });
    expect(press(false, 'End', false, 2, 0, 0)).toEqual({ type: 'open', index: 0 });
  });

  it('opens a closed list with Alt+ArrowDown without moving, and ignores every other Alt key and letters', () => {
    expect(press(false, 'ArrowDown', true)).toEqual({ type: 'open', index: 2 });
    expect(press(false, 'ArrowUp', true)).toEqual({ type: 'none' });
    expect(press(false, 'Home', true)).toEqual({ type: 'none' });
    expect(press(false, 'a')).toEqual({ type: 'none' });
    expect(press(false, 'PageDown')).toEqual({ type: 'none' });
  });

  it('moves the highlight of an open list by one, by ten and to the ends', () => {
    expect(press(true, 'ArrowDown')).toEqual({ type: 'move', index: 5 });
    expect(press(true, 'PageDown')).toEqual({ type: 'move', index: 14 });
    expect(press(true, 'PageUp')).toEqual({ type: 'move', index: 0 });
    expect(press(true, 'End')).toEqual({ type: 'move', index: 29 });
    expect(press(true, 'Home')).toEqual({ type: 'move', index: 0 });
  });

  it('chooses with Enter, Space and Alt+ArrowUp, closes with Escape and Tab, and ignores Alt+ArrowDown', () => {
    expect(press(true, 'Enter')).toEqual({ type: 'choose' });
    expect(press(true, ' ')).toEqual({ type: 'choose' });
    expect(press(true, 'ArrowUp', true)).toEqual({ type: 'choose' });
    expect(press(true, 'Escape')).toEqual({ type: 'close' });
    expect(press(true, 'Tab')).toEqual({ type: 'close' });
    expect(press(true, 'ArrowDown', true)).toEqual({ type: 'none' });
    expect(press(true, 'a')).toEqual({ type: 'none' });
  });
});

describe('typing to jump to an option', () => {
  const labels = ['Apple', 'avocado', 'Banana', 'Blueberry'];

  it('finds the next label that starts with the letter, ignoring case', () => {
    expect(typeaheadIndex(labels, 0, 'a')).toBe(1);
    expect(typeaheadIndex(labels, 1, 'a')).toBe(0);
    expect(typeaheadIndex(labels, 0, 'b')).toBe(2);
  });

  it('steps through the matches when the same letter is typed again', () => {
    expect(typeaheadIndex(labels, 2, 'bb')).toBe(3);
    expect(typeaheadIndex(labels, 3, 'bb')).toBe(2);
  });

  it('keeps the current option while more letters narrow it down', () => {
    expect(typeaheadIndex(labels, 3, 'bl')).toBe(3);
    expect(typeaheadIndex(labels, 0, 'bl')).toBe(3);
  });

  it('finds nothing when no label starts with it', () => {
    expect(typeaheadIndex(labels, 0, 'z')).toBe(-1);
    expect(typeaheadIndex(labels, 0, '')).toBe(-1);
    expect(typeaheadIndex([], 0, 'a')).toBe(-1);
  });
});

describe('a shared device answering an individual question', () => {
  const team: Student[] = [
    ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id, i): Student => ({ id, name: id, cardNumber: i + 1, groupId: 'g1' })),
    ...['b1', 'b2'].map((id, i): Student => ({ id, name: id, cardNumber: i + 6, groupId: 'g2' })),
  ];
  const full: AttendedRoster = { groups, students: team, present: null };
  const rolled = (present: string[]): AttendedRoster => ({ ...full, present });
  const groupChoice: ChoiceSlide = { ...choice, id: 'gq', scope: 'group', points: 3 };
  const mixed: Lesson = { ...lesson, slides: [choice, groupChoice] };
  const revealed: Session = { ...session, reveals: { q1: { correctIndex: 1, explanation: '' }, gq: { correctIndex: 1, explanation: '' } } };
  const keys = publishedKeys(revealed);
  const forGroup = (value: number, groupId = 'g1') => answer('q1', 'group', groupId, value);
  const own = (studentId: string, value: number) => answer('q1', 'student', studentId, value);
  const sourceOf = (roster: AttendedRoster, answers: Answer[], studentId: string) => effectiveAnswer(roster, answers, choice, studentId)?.from ?? null;
  const waitingIds = (statuses: ReturnType<typeof answerStatusByGroup>) =>
    statuses.flatMap((entry) => entry.students.filter((s) => s.mark === 'waiting').map((s) => s.student.id)).sort();

  describe('whose answer counts for a student', () => {
    it('is her own answer when she gave one, whichever arrived first', () => {
      for (const answers of [[forGroup(0), own('a1', 2)], [own('a1', 2), forGroup(0)]]) {
        expect(effectiveAnswer(full, answers, choice, 'a1')).toMatchObject({ from: 'own', answer: { value: 2 } });
        expect(effectiveAnswer(full, answers, choice, 'a2')).toMatchObject({ from: 'group', answer: { value: 0 } });
      }
    });

    it('is none when neither she nor her group answered, and never reads another group', () => {
      expect(effectiveAnswer(full, [forGroup(0, 'g2')], choice, 'a1')).toBeNull();
      expect(effectiveAnswer(full, [], choice, 'a1')).toBeNull();
    });

    it('covers everyone on the list while no roll was taken, and only the present once one was', () => {
      expect(sourceOf(full, [forGroup(0)], 'a5')).toBe('group');
      expect(sourceOf(rolled(['a1']), [forGroup(0)], 'a5')).toBeNull();
      expect(sourceOf(rolled(['a1']), [forGroup(0)], 'a1')).toBe('group');
    });

    it('follows the group she is in now', () => {
      const moved: AttendedRoster = { ...moveStudent(full, 'a1', 'g2')!, present: null };
      const answers = [forGroup(0, 'g1'), forGroup(2, 'g2')];
      expect(effectiveAnswer(full, answers, choice, 'a1')).toMatchObject({ answer: { value: 0 } });
      expect(effectiveAnswer(moved, answers, choice, 'a1')).toMatchObject({ answer: { value: 2 } });
    });

    it('is nothing on a group question', () => {
      expect(effectiveAnswer(full, [answer('gq', 'group', 'g1', 1)], groupChoice, 'a1')).toBeNull();
    });
  });

  describe('the tally', () => {
    it('adds one per covered present student, and a self-answering one under her own option', () => {
      expect(tallyChoices(choice, full, [], [forGroup(1)])).toEqual([0, 5, 0]);
      expect(tallyChoices(choice, full, [], [forGroup(1), own('a3', 0)])).toEqual([1, 4, 0]);
      expect(tallyChoices(choice, full, [], [own('a3', 0), forGroup(1)])).toEqual([1, 4, 0]);
    });

    it('moves a student\'s count with her: her old group\'s tally drops by one and her new group\'s answer covers her', () => {
      const moved: AttendedRoster = { ...moveStudent(full, 'a1', 'g2')!, present: null };
      const answers = [forGroup(0, 'g1'), forGroup(2, 'g2')];
      expect(tallyChoices(choice, full, [], answers)).toEqual([5, 0, 2]);
      expect(tallyChoices(choice, moved, [], answers)).toEqual([4, 0, 3]);
    });

    it('adds nothing for an absent member', () => {
      expect(tallyChoices(choice, rolled(['a1', 'a2', 'b1']), [], [forGroup(1)])).toEqual([0, 2, 0]);
    });

    it('answers N of M for the covered, and the waiting marks equal the waiting list in every case', () => {
      const cases: [AttendedRoster, Answer[]][] = [
        [full, [forGroup(1)]],
        [full, [forGroup(1), own('b1', 0)]],
        [rolled(['a1', 'a2', 'b1']), [forGroup(1)]],
        [rolled(['a1', 'a2', 'b1']), [forGroup(1, 'g2')]],
        [full, []],
      ];
      for (const [roster, answers] of cases) {
        const tally = tallyAnswerers(choice, roster, [], answers);
        expect(waitingIds(answerStatusByGroup(choice, roster, [], answers))).toEqual(tally.waiting.map((w) => w.id).sort());
      }
      expect(tallyAnswerers(choice, full, [], [forGroup(1)])).toMatchObject({ answered: 5, expected: 7 });
      expect(tallyAnswerers(choice, rolled(['a1', 'a2', 'b1']), [], [forGroup(1)])).toMatchObject({ answered: 2, expected: 3, waiting: [{ id: 'b1' }] });
    });

    it('counts a text question answered by the shared device', () => {
      const text: TextSlide = { ...groupText, id: 'tx', scope: 'individual' };
      expect(tallyAnswerers(text, full, [], [answer('tx', 'group', 'g2', 'نص')])).toMatchObject({ answered: 2, expected: 7 });
    });

    it('leaves a group question as it was: one answer, counted once', () => {
      const answers = [answer('gq', 'group', 'g1', 1)];
      expect(tallyChoices(groupChoice, full, [], answers)).toEqual([0, 1, 0]);
      expect(tallyAnswerers(groupChoice, full, [], answers)).toMatchObject({ answered: 1, expected: 2 });
    });
  });

  describe('points and scores', () => {
    it('gives each covered student the points of the group answer, and the group their average', () => {
      const answers = [forGroup(1)];
      expect(team.map((s) => studentPoints(mixed, full, s.id, answers, keys))).toEqual([2, 2, 2, 2, 2, 0, 0]);
      expect(scoreboard(mixed, full, answers, keys).map((entry) => entry.score)).toEqual([2, 0]);
    });

    it('lets a student who answered herself earn from her own answer only', () => {
      const answers = [forGroup(1), own('a3', 0)];
      expect(studentPoints(mixed, full, 'a3', answers, keys)).toBe(0);
      expect(scoreboard(mixed, full, answers, keys)[0].score).toBe(1.6);
    });

    it('earns nothing for an absent member and averages over the present ones', () => {
      const roster = rolled(['a1', 'a2', 'b1']);
      expect(studentPoints(mixed, roster, 'a5', [forGroup(1)], keys)).toBe(0);
      expect(scoreboard(mixed, roster, [forGroup(1)], keys)[0].score).toBe(2);
    });

    it('adds a group question once, to the group, as before', () => {
      expect(scoreboard(mixed, full, [answer('gq', 'group', 'g1', 1)], keys).map((entry) => entry.score)).toEqual([3, 0]);
    });
  });

  describe('what each reader shows', () => {
    it('shows a student her results with the group answer, its verdict and where it came from', () => {
      const report = studentReport(mixed, revealed, full, team[0], [forGroup(1)]);
      expect(report.points).toBe(2);
      expect(report.results).toMatchObject([{ answer: { value: 1 }, verdict: 'correct', byGroup: true }]);
      expect(studentReport(mixed, revealed, full, team[0], [forGroup(0), own('a1', 1)]).results).toMatchObject([{ answer: { value: 1 }, byGroup: false }]);
    });

    it('marks the monitor cells given by the group, and counts them as interactions and points', () => {
      const [first, second] = buildMonitor(mixed, revealed, full, [forGroup(1), own('a2', 0)], [], keys);
      expect(first.rows.map((row) => row.cells[0])).toMatchObject([
        { byGroup: true, verdict: 'correct' }, { byGroup: false, verdict: 'wrong' }, { byGroup: true }, { byGroup: true }, { byGroup: true },
      ]);
      expect(first.rows.map((row) => [row.answered, row.points])).toEqual([[1, 2], [1, 0], [1, 2], [1, 2], [1, 2]]);
      expect(second.rows.map((row) => row.cells[0].answer)).toEqual([null, null]);
      expect(first.score).toBe(1.6);
    });

    it('counts the group answer as her interaction and spares her the unresponsive flag', () => {
      const five: Lesson = { ...lesson, slides: Array.from({ length: 5 }, (_, i) => ({ ...choice, id: `i${i}` })) };
      const closed: Session = { ...session, reveals: Object.fromEntries(['i0', 'i1', 'i2', 'i3'].map((id) => [id, { correctIndex: 1, explanation: '' }])) };
      const answers = ['i0', 'i1', 'i2', 'i3'].map((id) => answer(id, 'group', 'g1', 1));
      expect(interactionsOf(five, full, answers, 'a1')).toBe(4);
      expect(interactionsOf(five, full, answers, 'b1')).toBe(0);
      expect(isUnresponsive(closed, five, full, answers, 'a1')).toBe(false);
      expect(isUnresponsive(closed, five, full, answers, 'b1')).toBe(true);
    });

    it('keeps the covered answers and points in the kept record, and nothing for the absent', () => {
      const record = classRecord(session, mixed, rolled(['a1', 'a2', 'b1']), [forGroup(1)]);
      const row = (id: string) => record.students.find((s) => s.studentId === id)!;
      expect(row('a1')).toMatchObject({ answered: 1, points: 2 });
      expect(row('a5')).toMatchObject({ answered: 0, points: 0, present: false });
      expect(row('b1')).toMatchObject({ answered: 0, points: 0 });
    });
  });

  describe('entering an answer by hand', () => {
    it('starts from what counts for her now: the first option when nothing does, her group\'s option when it covers her, her own otherwise', () => {
      expect(nextManualChoiceFor(null, 3)).toBe(0);
      expect(nextManualChoiceFor(effectiveAnswer(full, [forGroup(1)], choice, 'a1'), 3)).toBe(2);
      expect(nextManualChoiceFor(effectiveAnswer(full, [forGroup(1), own('a1', 0)], choice, 'a1'), 3)).toBe(1);
    });

    it('lets her own answer step to none after the last option, but wraps a covered student round to the first', () => {
      expect(nextManualChoiceFor(effectiveAnswer(full, [own('a1', 2)], choice, 'a1'), 3)).toBeNull();
      expect(nextManualChoiceFor(effectiveAnswer(full, [forGroup(2)], choice, 'a1'), 3)).toBe(0);
    });
  });

  describe('what letting a shared device in puts on the roll', () => {
    const seat = (studentId: string | null, groupId = 'g1'): Participant => ({ id: 'p', sessionId: 'x', groupId, studentId, joinedAt: 0, admitted: true });

    it('is her own name for a named seat, and every student of the group for a shared device', () => {
      expect(studentsJoiningRoll(seat('a2'), team)).toEqual(['a2']);
      expect(studentsJoiningRoll(seat(null), team)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
      expect(studentsJoiningRoll(seat(null, 'g2'), team)).toEqual(['b1', 'b2']);
    });

    it('follows the students of the group now, and is empty for a group without students', () => {
      const moved = moveStudent(full, 'a1', 'g2')!.students;
      expect(studentsJoiningRoll(seat(null), moved)).toEqual(['a2', 'a3', 'a4', 'a5']);
      expect(studentsJoiningRoll(seat(null, 'g9'), team)).toEqual([]);
    });

    it('covers its group once on the roll, and not a member the teacher then marks absent', () => {
      const roll = joinRoll(full, studentsJoiningRoll(seat(null), team));
      expect(roll.present).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
      expect(sourceOf(roll, [forGroup(1)], 'a3')).toBe('group');
      expect(sourceOf(markAbsent(roll, 'a3')!, [forGroup(1)], 'a3')).toBeNull();
      expect(sourceOf(roll, [forGroup(1, 'g2')], 'b1')).toBeNull();
    });
  });

  describe('what a device shows', () => {
    const shared = { groupId: 'g1', studentId: null };
    const named = { groupId: 'g1', studentId: 'a1' };

    it('shows a shared device its own group answer and a named one what counts for her', () => {
      expect(deviceAnswer(full, [forGroup(2)], choice, shared)).toMatchObject({ coveredByGroup: false, answer: { value: 2 } });
      expect(deviceAnswer(full, [forGroup(2)], choice, named)).toMatchObject({ coveredByGroup: true, answer: { value: 2 } });
      expect(deviceAnswer(full, [forGroup(2), own('a1', 0)], choice, named)).toMatchObject({ coveredByGroup: false, answer: { value: 0 } });
      expect(deviceAnswer(full, [answer('gq', 'group', 'g1', 1)], groupChoice, named)).toMatchObject({ coveredByGroup: false, answer: { value: 1 } });
    });

    it('says a shared device answers for the whole group only on an individual question', () => {
      expect(answersForWholeGroup(choice, shared)).toBe(true);
      expect(answersForWholeGroup(choice, named)).toBe(false);
      expect(answersForWholeGroup(groupChoice, shared)).toBe(false);
    });
  });
});
