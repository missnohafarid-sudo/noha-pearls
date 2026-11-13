import { describe, expect, it } from 'vitest';
import { contestedRequestNumber, namesHeldByOthers, requestNumber } from './admission';
import { studentReport } from './analytics';
import { FolderTree } from './folders';
import type { ChoiceSlide, Lesson, LessonFolder, Session } from './models';
import { messageFor } from './pacing';
import { optionMark, pointsFor, publishedKeys, verdictFor } from './scoring';
import { liveSessions } from './sessions';
import { answers, ended, lesson, live, reveal1, reveal2, roster, seatOf, students } from './visibilityFixtures';
import {
  anyClassLive, catalogueFor, classLessonFor, foldersFor, lessonFor, lessonSummaries, lessonSummary, nameClaims, readerOf, seenRoster, sessionFor, withoutKey,
  type Reader,
} from './visibility';

const visitor: Reader = { isAdmin: false, seat: null };
const named: Reader = { isAdmin: false, seat: { groupId: 'g1', studentId: 's1' } };
const admin: Reader = { isAdmin: true, seat: null };

describe('who is reading', () => {
  it('reads an admin with or without a seat', () => {
    expect(readerOf(true, null, students)).toEqual({ isAdmin: true, seat: null });
    expect(readerOf(true, seatOf('p', 'g1', 's1'), students)).toEqual({ isAdmin: true, seat: { groupId: 'g1', studentId: 's1' } });
  });

  it('gives no seat to a waiting or a removed device', () => {
    expect(readerOf(false, seatOf('p', 'g1', 's1', false), students).seat).toBeNull();
    expect(readerOf(false, null, students).seat).toBeNull();
  });

  it('gives a let-in named seat her student and group, and a shared device only its group', () => {
    expect(readerOf(false, seatOf('p', 'g1', 's1'), students).seat).toEqual({ groupId: 'g1', studentId: 's1' });
    expect(readerOf(false, seatOf('p', 'g2', null), students).seat).toEqual({ groupId: 'g2', studentId: null });
  });

  it('follows a student moved to another group', () => {
    const moved = students.map((s) => (s.id === 's3' ? { ...s, groupId: 'g1' } : s));
    expect(readerOf(false, seatOf('p', 'g2', 's3'), moved).seat).toEqual({ groupId: 'g1', studentId: 's3' });
  });
});

describe('the lesson without its key', () => {
  const choices = (l: Lesson) => l.slides.filter((s): s is ChoiceSlide => s.kind === 'choice');
  const noKey = withoutKey(lesson);
  const sets: Session[] = [live, { ...live, reveals: reveal1 }, { ...live, reveals: { ...reveal2, q3: { correctIndex: 0, explanation: 'since' } } }];

  it('strips only the key of choice slides', () => {
    for (const slide of choices(noKey)) expect([slide.correctIndex, slide.explanation]).toEqual([null, '']);
    expect(noKey.slides[0]).toEqual(lesson.slides[0]);
    expect(noKey.slides[2]).toEqual(lesson.slides[2]);
    expect(choices(noKey).map((s) => s.options)).toEqual(choices(lesson).map((s) => s.options));
    expect(JSON.stringify(noKey)).not.toContain('because');
    expect(JSON.stringify(noKey)).toContain('secret text');
    expect(JSON.stringify(noKey)).toContain('https://a.example/p.png');
    expect(choices(lesson)[0].correctIndex).toBe(1);
  });

  it('changes nothing a marked answer shows, for any reveals', () => {
    for (const session of sets) {
      const keys = publishedKeys(session);
      for (const [full, bare] of choices(lesson).map((s, i) => [s, choices(noKey)[i]] as const)) {
        for (const value of [0, 1, 2]) {
          const a = answers[0];
          expect(verdictFor(bare, { ...a, value }, keys)).toBe(verdictFor(full, { ...a, value }, keys));
          expect(pointsFor(bare, { ...a, value }, keys)).toBe(pointsFor(full, { ...a, value }, keys));
          expect(optionMark(keys(bare), value, 1)).toBe(optionMark(keys(full), value, 1));
        }
      }
      for (const student of students) {
        const strip = (l: Lesson) => studentReport(l, session, roster, student, answers);
        const shape = (r: ReturnType<typeof strip>) => ({ points: r.points, results: r.results.map(({ answer, verdict, byGroup }) => ({ answer, verdict, byGroup })) });
        expect(shape(strip(noKey))).toEqual(shape(strip(lesson)));
      }
    }
  });
});

describe('lessons a caller receives', () => {
  const draft: Lesson = { ...lesson, id: 'l2', published: false, updatedAt: 9 };
  const old: Lesson = { ...lesson, id: 'l3', updatedAt: 1, slides: [lesson.slides[0]] };

  it('summarises a lesson with its counts and no slides', () => {
    expect(lessonSummary(lesson)).toEqual({
      id: 'l1', folderId: null, title: 'Lesson', subject: 'Maths', grade: '7', published: true, updatedAt: 5, slideCount: 4, questionCount: 3,
    });
  });

  it('lists summaries newest first', () => {
    expect(lessonSummaries([lesson, draft, old]).map((l) => l.id)).toEqual(['l2', 'l1', 'l3']);
  });

  it('lets the admin see every lesson and a visitor the published ones', () => {
    expect(catalogueFor(true, [lesson, draft, old]).map((l) => l.id)).toEqual(['l2', 'l1', 'l3']);
    expect(catalogueFor(false, [lesson, draft, old]).map((l) => l.id)).toEqual(['l1', 'l3']);
  });

  it('gives the admin the lesson raw and a visitor the published one without its key', () => {
    expect(lessonFor(true, draft)).toBe(draft);
    expect(lessonFor(false, draft)).toBeNull();
    expect(lessonFor(false, lesson)).toEqual(withoutKey(lesson));
    expect(lessonFor(false, null)).toBeNull();
  });

  it('gives a let-in seat her class lesson even unpublished, without its key, and others none', () => {
    expect(classLessonFor(admin, draft)).toBe(draft);
    expect(classLessonFor(named, draft)).toEqual(withoutKey(draft));
    expect(classLessonFor(visitor, draft)).toBeNull();
    expect(classLessonFor(named, null)).toBeNull();
  });
});

describe('folders a caller receives', () => {
  const folder = (id: string, parentId: string | null, order = 1): LessonFolder => ({ id, name: id, parentId, order });
  const shelf = [folder('a', null), folder('b', 'a'), folder('c', null, 2), folder('d', 'c')];
  const inFolder = (folderId: string | null, published: boolean) => ({ folderId, published });

  it('gives the admin every folder', () => {
    expect(foldersFor(true, shelf, [])).toEqual(shelf);
  });

  it('gives a visitor the folders that hold a published lesson at any depth, and their ancestors', () => {
    const received = foldersFor(false, shelf, [inFolder('b', true), inFolder('d', false)]);
    expect(received.map((f) => f.id)).toEqual(['a', 'b']);
    expect(received.map((f) => f.parentId)).toEqual([null, 'a']);
  });

  it('gives each folder its shown parent, so her tree equals the server tree on a stored loop', () => {
    const loop = [folder('L1', 'L3'), folder('L2', 'L1', 2), folder('L3', 'L2', 3)];
    const lessons = [inFolder('L1', true), inFolder('L2', true)];
    const server = new FolderTree(loop);
    const received = foldersFor(false, loop, lessons);
    const hers = new FolderTree(received);
    expect(received.map((f) => f.id)).toEqual(['L1', 'L2']);
    for (const { id } of received) expect(hers.parentOf(id)).toBe(server.parentOf(id));
    expect(received.map((f) => f.parentId)).toEqual([null, null]);
  });
});

describe('the class a caller receives', () => {
  const talked: Session = { ...live, reveals: reveal1, message: { id: 'm', text: 'look', groupId: 'g2' } };
  const toAll: Session = { ...talked, message: { id: 'm', text: 'all', groupId: null } };

  it('gives the admin the session raw', () => {
    expect(sessionFor(admin, talked)).toBe(talked);
  });

  it('gives a seat only the message meant for her group or for everyone, and keeps the rest', () => {
    expect(sessionFor(named, talked)).toEqual({ ...talked, message: messageFor(talked, 'g1') });
    expect(sessionFor(named, talked).message).toBeNull();
    expect(sessionFor(named, toAll).message?.text).toBe('all');
    expect(sessionFor({ isAdmin: false, seat: { groupId: 'g2', studentId: null } }, talked).message?.text).toBe('look');
    expect(sessionFor(named, talked).reveals).toEqual(reveal1);
  });

  it('gives anyone outside no reveals and no message, and keeps the rest', () => {
    expect(sessionFor(visitor, talked)).toEqual({ ...talked, reveals: {}, message: null });
  });

  it('says whether any class is live', () => {
    expect(anyClassLive([ended])).toBe(false);
    expect(anyClassLive([ended, live])).toBe(liveSessions([ended, live]).length > 0);
    expect(anyClassLive([])).toBe(false);
  });
});

describe('the roster a device sees', () => {
  const attended = { ...roster, present: ['s1'] };
  const seen = seenRoster(attended);

  it('keeps the order, the groups and the names, and drops the roll, card numbers and roster id', () => {
    expect(seen.groups).toEqual(roster.groups);
    expect(seen.students).toEqual([
      { id: 's1', name: 'Sara', groupId: 'g1' },
      { id: 's2', name: 'Noor', groupId: 'g1' },
      { id: 's3', name: 'Reem', groupId: 'g2' },
    ]);
    expect(Object.keys(seen)).toEqual(['groups', 'students']);
  });
});

describe('name claims', () => {
  const held = seatOf('a', 'g1', 's1');
  const asking = seatOf('b', 'g1', 's1', false, 2);
  const other = seatOf('c', 'g2', 's3', false, 3);
  const shared = seatOf('d', 'g1', null, false, 4);

  it('lists the names other devices hold, whatever the viewer is', () => {
    const all = [held, asking, other, shared];
    for (const own of [null, held, asking, other, shared]) {
      expect(nameClaims(all, own).heldByOthers).toEqual([...namesHeldByOthers(all, own?.id ?? null)]);
    }
    expect(nameClaims(all, other).heldByOthers).toEqual(['s1']);
  });

  it('gives the request number only to a seat whose name is held or asked for elsewhere', () => {
    const all = [held, asking, other];
    expect(nameClaims(all, asking).requestNumber).toBe(contestedRequestNumber(all, asking));
    expect(nameClaims(all, asking).requestNumber).toBe(requestNumber(asking));
    expect(nameClaims(all, other).requestNumber).toBeNull();
    expect(nameClaims(all, held).requestNumber).toBeNull();
    expect(nameClaims(all, null).requestNumber).toBeNull();
  });

  it('gives the two devices asking for one name different numbers, as the teacher sees them', () => {
    const twins = [seatOf('p1', 'g1', 's2', false, 1), seatOf('p2', 'g1', 's2', false, 2)];
    expect(twins.map((own) => nameClaims(twins, own).requestNumber)).toEqual(twins.map((own) => requestNumber(own)));
    expect(nameClaims(twins, twins[0]).heldByOthers).toEqual(['s2']);
  });
});
