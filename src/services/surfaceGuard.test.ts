import { beforeEach, describe, expect, it } from 'vitest';
import { answers, hearts, lesson, live, roster, seatOf } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import type { CollectionName } from '../ports/store';
import { NotAuthorizedError } from './AuthService';
import { createDataServices } from './createDataServices';
import { UI_SURFACE } from './Services';
import { effectsOf, SURFACE_EFFECTS } from './surfaceEffects';

/** Every method of the surface is public by design, listed here with the reason, or admin only, listed here with harmless arguments. */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'content.watchSite': 'the school name and welcome text are the home page',
  'teachers.watchTeachers': 'the home page names the teachers',
  'folders.watchFolders': 'folders are cut to those holding a published lesson',
  'lessons.watchLessons': 'summaries of published lessons only',
  'lessons.watchLesson': 'a published lesson without its key',
  'lessons.exportToText': 'formats a lesson the caller already holds; reads nothing',
  'classLookup.watchAnyLive': 'whether any class runs, nothing about which',
  'classLookup.watchByCode': 'the class a code names, cut to what the caller may read',
  'sessionRoster.watchSeen': 'names and groups a device picks from, by the class code; no roll or card numbers',
  'participants.watchMine': 'the device reads its own seat',
  'participants.watchNameClaims': 'which names are held, no seat of another device',
  'participants.join': 'the device asks for its own seat and waits for the teacher',
  'participants.leave': 'the device gives up its own seat',
  'answers.submitFromDevice': 'a let-in device answers for its own seat; checked against the stored seat',
  'answers.submitForMember': 'a let-in shared device answers for a present member of its group; checked against the stored seat and the seats of the class',
  'rewards.watchHeartCount': 'a number of hearts, nothing about whom',
  'rewards.giveAsPeer': 'a let-in device gives a heart; checked against the stored seat',
  'records.currentPeriod': 'the week or month of today',
  'records.groupStandingsOf': 'group totals only',
  'records.ownStandingIn': 'the standing of the student this device was let in as',
  'records.watchKeptCount': 'a number of kept classes, by the class code',
  'board.watchTotals': 'group totals of a class by its code',
  'board.watchCardResults': 'the lines of the student whose card is shown',
  'seatView.watchMine': 'a let-in device reads its own view',
  'seatView.watchLesson': 'a let-in device reads its class lesson without its key',
};

const listener = () => undefined;
const group = { id: 'g1', classId: 'c1', name: 'x', color: '#000', order: 1 };
const range = { from: { year: 2026, month: 1, day: 1 }, to: { year: 2026, month: 1, day: 2 } };
const ADMIN_ONLY: Record<string, unknown[]> = {
  'content.updateSite': [{ tagline: 'x' }],
  'roster.watchClasses': [listener],
  'roster.watchRoster': ['c1', listener],
  'roster.addClass': ['New'],
  'roster.renameClass': ['c1', 'New'],
  'roster.removeClass': ['c1'],
  'roster.addGroup': ['c1', 'New'],
  'roster.saveGroup': [group],
  'roster.removeGroup': ['g1'],
  'roster.addStudent': ['New', 'g1'],
  'roster.saveStudent': [{ id: 's1', name: 'New', cardNumber: 1, groupId: 'g1' }],
  'roster.removeStudent': ['s1'],
  'roster.importFromText': ['c1', '', 'merge'],
  'roster.exportToText': ['c1', 'header'],
  'teachers.add': ['New'],
  'teachers.rename': ['t1', 'New'],
  'teachers.remove': ['t1'],
  'folders.add': ['New', null],
  'folders.rename': ['f1', 'New'],
  'folders.move': ['f1', null],
  'folders.remove': ['f1', false],
  'lessons.create': ['New', null],
  'lessons.save': [lesson],
  'lessons.moveToFolder': [['l1'], null],
  'lessons.setPublished': [['l1'], true],
  'lessons.remove': [['l1']],
  'lessons.importFromText': ['', null],
  'sessions.watchAll': [listener],
  'sessions.watchLive': [listener],
  'sessions.start': ['l1', 'c1', 't1'],
  'sessions.end': ['x'],
  'sessions.goTo': ['x', 1],
  'sessions.reveal': ['x', 'q1'],
  'sessions.setPacing': ['x', [], 'free'],
  'sessions.sendMessage': ['x', '', null],
  'sessions.clearMessage': ['x'],
  'sessions.setMinInteractions': ['x', 1],
  'sessions.setHiddenOpen': ['x', 'c1', '0a1b2c3d', true],
  'sessionRoster.watchRoster': ['x', listener],
  'sessionRoster.moveStudent': ['x', 's1', 'g1'],
  'sessionRoster.addStudent': ['x', 'New', 'g1'],
  'sessionRoster.renameGroup': ['x', 'g1', 'New'],
  'sessionRoster.markPresent': ['x', 's1'],
  'sessionRoster.markAbsent': ['x', 's1'],
  'participants.watchParticipants': ['x', listener],
  'admission.admit': ['x:d2', 's1'],
  'admission.takeRoll': ['x', ['s1']],
  'admission.admitAll': ['x'],
  'admission.remove': ['x:d2'],
  'answers.watchAnswers': ['x', listener],
  'answers.submitForStudent': ['x', 'q1', 's1', 0, 'manual'],
  'answers.clearForStudent': ['x', 'q1', 's1'],
  'rewards.watchRewards': ['x', listener],
  'rewards.giveAsTeacher': ['x', { kind: 'student', id: 's1' }],
  'rewards.takeAsTeacher': ['x', { kind: 'student', id: 's1' }],
  'allowance.watchLevel': [listener],
  'records.watchClassKeptCount': ['c1', listener],
  'records.standingsOf': ['c1', { kind: 'week', start: 0, end: 1 }],
  'retention.watchSettings': [listener],
  'retention.watchNotices': [listener],
  'retention.rangeLimits': [],
  'retention.setYearEnd': [null],
  'retention.classesToRemove': ['c1', range],
  'retention.removeClasses': ['c1', range, ['x']],
};

const COLLECTIONS: Record<CollectionName, true> = {
  site: true, classes: true, teachers: true, groups: true, students: true, folders: true, lessons: true, sessions: true, rosters: true,
  participants: true, answers: true, rewards: true, records: true, retention: true,
};

const surface = Object.entries(UI_SURFACE).flatMap(([service, names]) => (names as readonly string[]).map((name) => `${service}.${name}`));

let store: LocalDocumentStore;
let admin = false;
const caller: Caller = { isAdmin: () => admin, deviceId: () => 'd1' };

async function everything(): Promise<string> {
  const stored = await Promise.all(Object.keys(COLLECTIONS).map((name) => store.list(name as CollectionName)));
  return JSON.stringify(stored);
}

beforeEach(async () => {
  admin = false;
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', live);
  await store.put('lessons', lesson);
  await store.put('rosters', roster);
  await store.put('classes', { id: 'c1', name: '11-3', order: 1 });
  await store.put('groups', group);
  await store.put('students', { id: 's1', name: 'Sara', cardNumber: 1, groupId: 'g1' });
  await store.put('teachers', { id: 't1', name: 'Huda', order: 1 });
  await store.put('folders', { id: 'f1', name: 'Folder', parentId: null, order: 1 });
  await store.put('participants', seatOf('x:d2', 'g1', 's1', false));
  await Promise.all(answers.map((a) => store.put('answers', a)));
  await Promise.all(hearts.map((h) => store.put('rewards', h)));
});

describe('the surface of the services', () => {
  it('classifies every method as public by design or admin only, and lists no method it does not have', () => {
    const classified = [...Object.keys(PUBLIC_BY_DESIGN), ...Object.keys(ADMIN_ONLY)];
    expect(surface.filter((method) => !classified.includes(method))).toEqual([]);
    expect(classified.filter((method) => !surface.includes(method))).toEqual([]);
    expect(Object.keys(PUBLIC_BY_DESIGN).filter((method) => method in ADMIN_ONLY)).toEqual([]);
  });
});

describe('what each method of the surface does', () => {
  it('tags every method with exactly one effect (a read, an essential write or an ordinary write), and tags none the surface does not have', () => {
    expect(surface.filter((method) => effectsOf(...(method.split('.') as [string, string])).length !== 1)).toEqual([]);
    const tagged = Object.values(SURFACE_EFFECTS).flatMap((lists) => Object.entries(lists).flatMap(([service, names]) => (names as readonly string[]).map((name) => `${service}.${name}`)));
    expect(tagged.filter((method) => !surface.includes(method))).toEqual([]);
  });

  it('calls only the live reads and the questions that read reads, and the essential writes are answering, joining and leaving', () => {
    const reads = Object.entries(SURFACE_EFFECTS.read).flatMap(([service, names]) => names.map((name) => `${service}.${name}`));
    expect(reads.filter((method) => !method.split('.')[1].startsWith('watch'))).toEqual(['roster.exportToText', 'lessons.exportToText', 'records.currentPeriod', 'records.standingsOf', 'records.groupStandingsOf', 'records.ownStandingIn', 'retention.rangeLimits', 'retention.classesToRemove']);
    expect(SURFACE_EFFECTS.essential).toEqual({ participants: ['join', 'leave'], answers: ['submitFromDevice', 'submitForMember'] });
  });
});

async function outcome(call: () => unknown): Promise<unknown> {
  try {
    return await call();
  } catch (error) {
    return error;
  }
}

describe.each(surface.filter((method) => method in ADMIN_ONLY))('%s', (method) => {
  const [service, name] = method.split('.');
  const callIt = () => {
    const target = (createDataServices(store, caller) as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>)[service];
    return target[name](...ADMIN_ONLY[method]);
  };

  it('refuses a signed-out caller and changes nothing', async () => {
    const before = await everything();
    expect(await outcome(callIt)).toBeInstanceOf(NotAuthorizedError);
    expect(await everything()).toBe(before);
  });

  it('refuses a device the teacher let in and changes nothing', async () => {
    await store.put('participants', seatOf('x:d1', 'g1', 's1'));
    const before = await everything();
    expect(await outcome(callIt)).toBeInstanceOf(NotAuthorizedError);
    expect(await everything()).toBe(before);
  });
});
