import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seatAnswerer } from '../domain/admission';
import { effectiveAnswer } from '../domain/answering';
import { newId } from '../domain/ids';
import { dateOf, inPeriod, periodAt, SCHOOL_UTC_OFFSET_MS } from '../domain/periods';
import type { Answer, ChoiceSlide, Id, Lesson, Reward, Student, TextSlide } from '../domain/models';
import { MAX_MESSAGE_LENGTH } from '../domain/text';
import type { Caller } from '../ports/caller';
import { SCHOOL_YEAR_CLEARED_COLLECTIONS, type CollectionName, type Collections, type DocumentStore, type Unsubscribe, type Where } from '../ports/store';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { PrototypeAuthGateway, sha256Hex } from '../infrastructure/PrototypeAuthGateway';
import { totpCode } from '../infrastructure/totp';
import { MemoryStorage } from '../infrastructure/storage';
import { AdmissionService } from './AdmissionService';
import { AnswerService } from './AnswerService';
import { AuthService, NotAuthorizedError } from './AuthService';
import { FolderService } from './FolderService';
import { FolderError } from './requireFolder';
import { LessonError, LessonService } from './LessonService';
import { RetentionError, RetentionService } from './RetentionService';
import { NameError } from './requireName';
import { RosterError, RosterService } from './RosterService';
import { SessionService } from './SessionService';
import { TeacherError, TeacherService } from './TeacherService';
import { participantsFor, recordsFor, rewardsFor, rostersFor } from './serviceKit';

const question: ChoiceSlide = {
  id: 'q1', kind: 'choice', title: 'س', tag: '', prompt: '؟', options: ['a', 'b'],
  correctIndex: 0, explanation: 'شرح', scope: 'individual', points: 1,
};
const groupQuestion: TextSlide = {
  id: 'q2', kind: 'text', title: 'ن', tag: '', prompt: '؟', placeholder: '', images: [], scope: 'group', points: 1,
};
const lesson: Lesson = {
  id: 'l1', folderId: null, title: 'درس', subject: '', grade: '', published: true, slides: [question, groupQuestion], updatedAt: 0,
};

const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const NOW = 1_700_000_000_000;

async function gateway(totpSecret: string | undefined = TOTP_SECRET) {
  return new PrototypeAuthGateway(
    { passwordSha256: await sha256Hex('secret'), totpSecret },
    new MemoryStorage(),
    'admin',
    () => NOW,
  );
}

function callerOf(auth: AuthService, deviceId: Id = newId()): Caller {
  return { isAdmin: () => auth.isAdmin(), deviceId: () => deviceId };
}

const validCode = () => totpCode(TOTP_SECRET, NOW);

async function setup() {
  const store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  const auth = new AuthService(await gateway());
  const caller = callerOf(auth);
  const roster = new RosterService(store, caller);
  const sessionRoster = rostersFor(store, caller);
  const teacherDevice = participantsFor(store, callerOf(auth), sessionRoster);
  const records = recordsFor(store, caller, sessionRoster, roster, teacherDevice);
  const lessons = new LessonService(store, caller);
  const clock = { now: NOW };
  return {
    store,
    caller,
    clock,
    retention: new RetentionService(store, caller, () => clock.now),
    auth,
    admission: new AdmissionService(store, caller, sessionRoster, sessionRoster),
    sessions: new SessionService(store, caller, roster, sessionRoster, records),
    records,
    sessionRoster,
    answers: new AnswerService(store, caller, teacherDevice, sessionRoster, sessionRoster),
    lessons,
    roster,
    teachers: new TeacherService(store, caller),
    folders: new FolderService(store, caller, lessons),
    rewards: rewardsFor(store, caller, teacherDevice, sessionRoster),
    participants: (deviceName: string) => participantsFor(store, callerOf(auth, `${deviceName}-${newId()}`), sessionRoster),
    /** One student device: its own seat memory, and the services that act through that seat. */
    device: (deviceName: string) => {
      const own = callerOf(auth, `${deviceName}-${newId()}`);
      const participants = participantsFor(store, own, sessionRoster);
      return {
        participants,
        answers: new AnswerService(store, caller, participants, sessionRoster, sessionRoster),
        rewards: rewardsFor(store, caller, participants, sessionRoster),
        records: recordsFor(store, own, sessionRoster, roster, participants),
      };
    },
  };
}

describe('document store', () => {
  it('filters, replaces and notifies watchers', async () => {
    const { store } = await setup();
    const seen: number[] = [];
    const stop = store.watch('groups', { color: 'red' }, (docs) => seen.push(docs.length));
    await store.put('groups', { id: 'a', classId: 'c1', name: 'أ', color: 'red', order: 1 });
    await store.put('groups', { id: 'b', classId: 'c1', name: 'ب', color: 'blue', order: 2 });
    await store.put('groups', { id: 'a', classId: 'c1', name: 'أأ', color: 'red', order: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(seen.at(-1)).toBe(1);
    expect((await store.get('groups', 'a'))?.name).toBe('أأ');
    expect(await store.list('groups')).toHaveLength(2);
    await store.remove('groups', 'a');
    expect(await store.get('groups', 'a')).toBeNull();
  });
});

describe('admin access', () => {
  it('rejects a wrong password and admin commands from visitors', async () => {
    const { auth, sessions, lessons } = await setup();
    expect(await auth.signIn({ password: 'wrong', code: await validCode() })).toBe('wrong');
    expect(auth.isAdmin()).toBe(false);
    await expect(sessions.start('l1', 'c1', 't1')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(lessons.create('x', null)).rejects.toBeInstanceOf(NotAuthorizedError);
    expect(await auth.signIn({ password: 'secret', code: await validCode() })).toBe('signed-in');
    await auth.signOut();
    expect(auth.isAdmin()).toBe(false);
  });

  it('refuses the right password with a wrong code, and the right code with a wrong password', async () => {
    const { auth } = await setup();
    expect(await auth.signIn({ password: 'secret', code: '000000' })).toBe('wrong');
    expect(await auth.signIn({ password: 'wrong', code: await validCode() })).toBe('wrong');
    expect(auth.isAdmin()).toBe(false);
  });

  it('accepts a code typed with Arabic digits', async () => {
    const { auth } = await setup();
    const arabic = (await validCode()).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
    expect(await auth.signIn({ password: 'secret', code: arabic })).toBe('signed-in');
  });

  it('has no admin at all unless both secrets are configured', async () => {
    const noTotp = new AuthService(await gateway(''));
    expect(await noTotp.signIn({ password: 'secret', code: await validCode() })).toBe('wrong');
    const nothing = new AuthService(
      new PrototypeAuthGateway({ passwordSha256: undefined, totpSecret: undefined }, new MemoryStorage(), 'admin'),
    );
    expect(await nothing.signIn({ password: '', code: '' })).toBe('wrong');
  });
});

describe('a live class', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
    await ctx.auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.store.put('lessons', lesson);
    await ctx.store.put('classes', { id: 'c1', name: '11-3', order: 1 });
    await ctx.store.put('teachers', { id: 't1', name: 'أ. هدى', order: 1 });
  });

  /** The stored class list that seats are checked against. */
  const storeClassList = async () => {
    await ctx.store.put('groups', { id: 'g1', classId: 'c1', name: 'أ', color: '#000', order: 1 });
    await ctx.store.put('groups', { id: 'g2', classId: 'c1', name: 'ب', color: '#111', order: 2 });
    for (const student of [salma, mate, nour]) await ctx.store.put('students', student);
  };
  /** Starts a class of the stored class list, which must have its groups by then. */
  const begin = async () => {
    await storeClassList();
    return (await ctx.sessions.start(lesson.id, 'c1', 't1'))!;
  };
  let deviceCount = 0;
  /** A device that asked for a seat and was let in by the teacher. */
  const seated = async (sessionId: string, groupId: string, studentId: string | null) => {
    await storeClassList();
    deviceCount += 1;
    const device = ctx.device(`device-${deviceCount}`);
    const mine = (await device.participants.join((await ctx.store.get('sessions', sessionId))!.code, groupId, studentId))!;
    await ctx.admission.admit(mine.id, studentId);
    return device;
  };
  const salma: Student = { id: 's1', name: 'سلمى أحمد', cardNumber: 1, groupId: 'g1' };
  const mate: Student = { id: 's3', name: 'ليلى سعيد', cardNumber: 3, groupId: 'g1' };
  const nour: Student = { id: 's2', name: 'نور خالد', cardNumber: 2, groupId: 'g2' };

  it('runs several classes at once without touching one another', async () => {
    const { sessions, store } = ctx;
    const first = await begin();
    const { answers: firstAnswers } = await seated(first.id, 'g1', 's1');
    await firstAnswers.submitFromDevice(first.id, 'q1', 1);
    await sessions.goTo(first.id, 1);

    const second = await begin();
    expect(second.code).not.toBe(first.code);
    const keptFirst = (await store.get('sessions', first.id))!;
    expect(keptFirst.status).toBe('live');
    expect(keptFirst.slideIndex).toBe(1);
    expect(await store.list('answers', { sessionId: first.id })).toHaveLength(1);

    await sessions.end(second.id);
    expect((await store.get('sessions', first.id))!.status).toBe('live');
    expect((await store.get('sessions', second.id))!.status).toBe('ended');
  });

  it('never reuses the join code of a stored class', async () => {
    const { store } = ctx;
    const first = await begin();
    await store.put('sessions', { ...first, code: 'AAAAAA' });
    const allZeros = ((bytes: Uint8Array) => bytes.fill(0)) as typeof crypto.getRandomValues;
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementationOnce(allZeros);
    const second = await begin();
    spy.mockRestore();
    expect(second.code).not.toBe('AAAAAA');
  });

  it('locks a question on reveal', async () => {
    const { sessions, store } = ctx;
    const second = await begin();

    const { answers } = await seated(second.id, 'g1', 's1');
    expect(await answers.submitFromDevice(second.id, 'q1', 1)).toBe(true);
    expect(await answers.submitFromDevice(second.id, 'q1', 0)).toBe(true);
    expect(await store.list('answers', { sessionId: second.id })).toHaveLength(1);

    await sessions.reveal(second.id, 'q1');
    expect((await store.get('sessions', second.id))!.reveals.q1).toEqual({ correctIndex: 0, explanation: 'شرح' });
    expect(await answers.submitFromDevice(second.id, 'q1', 1)).toBe(false);
  });

  it('lets a shared group device answer an individual question for its group', async () => {
    const session = await begin();
    const { answers } = await seated(session.id, 'g1', null);
    expect(await answers.submitFromDevice(session.id, 'q1', 0)).toBe(true);
    const stored = await ctx.store.list('answers', { sessionId: session.id });
    expect(stored.map((a) => ({ subject: a.subject, slideId: a.slideId, value: a.value }))).toEqual([{ subject: { kind: 'group', id: 'g1' }, slideId: 'q1', value: 0 }]);
  });

  it('refuses a shared group device on an individual question after the reveal, like any answer', async () => {
    const session = await begin();
    const { answers } = await seated(session.id, 'g1', null);
    await ctx.sessions.reveal(session.id, 'q1');
    expect(await answers.submitFromDevice(session.id, 'q1', 0)).toBe(false);
    expect(await ctx.store.list('answers', { sessionId: session.id })).toEqual([]);
  });

  it('keeps one group answer per question, changeable, and answering leaves the roll as the admission made it', async () => {
    const session = await begin();
    const { answers } = await seated(session.id, 'g1', null);
    const roll = (await ctx.store.get('rosters', session.id))!.present;
    expect(await answers.submitFromDevice(session.id, 'q1', 0)).toBe(true);
    expect(await answers.submitFromDevice(session.id, 'q1', 1)).toBe(true);
    const stored = await ctx.store.list('answers', { sessionId: session.id });
    expect(stored.map((a) => a.value)).toEqual([1]);
    expect((await ctx.store.get('rosters', session.id))!.present).toEqual(roll);
  });

  it('keeps a named student answer beside the group answer of her shared device', async () => {
    const session = await begin();
    const shared = await seated(session.id, 'g1', null);
    const named = await seated(session.id, 'g1', 's1');
    await shared.answers.submitFromDevice(session.id, 'q1', 0);
    await named.answers.submitFromDevice(session.id, 'q1', 1);
    const stored = await ctx.store.list('answers', { sessionId: session.id });
    expect(stored.map((a) => [a.subject.kind, a.subject.id, a.value]).sort()).toEqual([['group', 'g1', 0], ['student', 's1', 1]]);
  });

  it('applies overlapping commands to the stored session without losing one', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    await Promise.all([sessions.reveal(session.id, 'q1'), sessions.goTo(session.id, 1), sessions.sendMessage(session.id, 'مرحبا', null)]);
    const saved = (await store.get('sessions', session.id))!;
    expect(Object.keys(saved.reveals)).toEqual(['q1']);
    expect(saved.slideIndex).toBe(1);
    expect(saved.message?.text).toBe('مرحبا');
  });

  it('reads slides and the slide count from the stored lesson', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    const { answers } = await seated(session.id, 'g1', 's1');
    await sessions.goTo(session.id, 99);
    expect((await store.get('sessions', session.id))!.slideIndex).toBe(1);
    expect(await answers.submitFromDevice(session.id, 'nope', 0)).toBe(false);
    await sessions.reveal(session.id, 'nope');
    await sessions.goTo('nope', 0);
    expect(Object.keys((await store.get('sessions', session.id))!.reveals)).toEqual([]);
    expect(await answers.submitFromDevice('nope', 'q1', 0)).toBe(false);
  });

  it('marks a reveal by the stored lesson, whatever the caller holds', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    await store.put('lessons', { ...lesson, slides: [{ ...question, correctIndex: 1 }, groupQuestion] });
    await sessions.reveal(session.id, 'q1');
    expect((await store.get('sessions', session.id))!.reveals.q1.correctIndex).toBe(1);
  });

  it('enters answers for a student on individual choice questions only', async () => {
    const { answers, store } = ctx;
    const session = await begin();
    const device = await seated(session.id, 'g1', null);
    await device.answers.submitFromDevice(session.id, 'q2', 'جواب المجموعة');
    expect(await answers.submitForStudent(session.id, 'q2', 's1', 'غيره', 'manual')).toBe(false);
    await answers.clearForStudent(session.id, 'q2', 's1');
    const kept = await store.list('answers', { sessionId: session.id });
    expect(kept.map((a) => a.value)).toEqual(['جواب المجموعة']);
  });

  it('sets pacing per group and pins to the current slide', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    await store.put('sessions', { ...session, slideIndex: 3 });
    await sessions.setPacing(session.id, ['g1', 'g2'], 'pinned');
    const saved = (await store.get('sessions', session.id))!;
    expect(saved.pacing).toEqual({ g1: { mode: 'pinned', slideIndex: 3 }, g2: { mode: 'pinned', slideIndex: 3 } });
  });

  it('only lets the admin enter card answers and teacher hearts', async () => {
    const { sessions, answers, rewards, auth } = ctx;
    const session = await begin();
    await storeClassList();
    expect(await answers.submitForStudent(session.id, 'q1', 's1', 0, 'card')).toBe(true);
    await auth.signOut();
    await expect(answers.submitForStudent(session.id, 'q1', 's1', 0, 'card')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(answers.clearForStudent(session.id, 'q1', 's1')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(sessions.reveal(session.id, 'q1')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(sessions.goTo(session.id, 0)).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(rewards.giveAsTeacher(session.id, { kind: 'student', id: 's1' })).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('enters and withdraws answers only for a stored student, with the group she is stored in', async () => {
    const { answers, store } = ctx;
    const session = await begin();
    await storeClassList();
    expect(await answers.submitForStudent(session.id, 'q1', 'nobody', 0, 'card')).toBe(false);
    expect(await answers.submitForStudent(session.id, 'q1', 's2', 1, 'card')).toBe(true);
    expect((await store.list('answers', { sessionId: session.id })).map((a) => a.subject)).toEqual([{ kind: 'student', id: 's2' }]);
    await answers.clearForStudent(session.id, 'q1', 'nobody');
    expect(await store.list('answers', { sessionId: session.id })).toHaveLength(1);
    await answers.clearForStudent(session.id, 'q1', 's2');
    expect(await store.list('answers', { sessionId: session.id })).toEqual([]);
  });

  it('gives a teacher heart only to a stored student or a stored group', async () => {
    const { rewards, store } = ctx;
    const session = await begin();
    await storeClassList();
    expect(await rewards.giveAsTeacher(session.id, { kind: 'student', id: 'nobody' })).toBe(false);
    expect(await rewards.giveAsTeacher(session.id, { kind: 'group', id: 'nobody' })).toBe(false);
    expect(await rewards.giveAsTeacher(session.id, { kind: 'student', id: 's1' })).toBe(true);
    expect(await rewards.giveAsTeacher(session.id, { kind: 'group', id: 'g2' })).toBe(true);
    expect((await store.list('rewards', { sessionId: session.id })).map((r) => r.target)).toEqual([{ kind: 'student', id: 's1' }, { kind: 'group', id: 'g2' }]);
  });

  it('lets students give hearts to other groups only, judged on the stored classmate', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    const girl = await seated(session.id, 'g2', 's2');
    const groupmate = await seated(session.id, 'g1', 's1');
    const shared = await seated(session.id, 'g2', null);
    expect(await groupmate.rewards.giveAsPeer(session.id, 's3')).toBe(false);
    expect(await groupmate.rewards.giveAsPeer(session.id, 's1')).toBe(false);
    expect(await groupmate.rewards.giveAsPeer(session.id, 'nobody')).toBe(false);
    expect(await shared.rewards.giveAsPeer(session.id, 's1')).toBe(false);
    expect(await girl.rewards.giveAsPeer(session.id, 's1')).toBe(true);
    await sessions.end(session.id);
    expect(await girl.rewards.giveAsPeer(session.id, 's1')).toBe(false);
    expect(await store.list('rewards', { sessionId: session.id })).toHaveLength(1);
  });

  it('refuses a waiting device an answer and a heart, and accepts it once admitted', async () => {
    const { store, auth } = ctx;
    const session = await begin();
    await storeClassList();
    const device = ctx.device('d1');
    const mine = (await device.participants.join(session.code, 'g2', 's2'))!;
    expect(mine.admitted).toBe(false);
    expect(await device.answers.submitFromDevice(session.id, 'q1', 1)).toBe(false);
    expect(await device.rewards.giveAsPeer(session.id, 's1')).toBe(false);
    await auth.signOut();
    await expect(ctx.admission.admit(mine.id, 's2')).rejects.toBeInstanceOf(NotAuthorizedError);
    await auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.admission.admit(mine.id, 's2');
    expect(await device.answers.submitFromDevice(session.id, 'q1', 1)).toBe(true);
    expect(await device.rewards.giveAsPeer(session.id, 's1')).toBe(true);
    expect(await store.list('answers', { sessionId: session.id })).toHaveLength(1);
  });

  it('never lets a device act through the admitted seat of another device', async () => {
    const { store } = ctx;
    const session = await begin();
    await storeClassList();
    await seated(session.id, 'g2', 's2');
    const waiting = ctx.device('impostor');
    expect(await waiting.participants.join(session.code, 'g2', 's2')).not.toBeNull();
    const stranger = ctx.device('stranger');
    for (const device of [waiting, stranger]) {
      expect(await device.answers.submitFromDevice(session.id, 'q1', 1)).toBe(false);
      expect(await device.rewards.giveAsPeer(session.id, 's1')).toBe(false);
    }
    expect(await store.list('answers')).toEqual([]);
    expect(await store.list('rewards')).toEqual([]);
  });

  it('refuses a seat for an unknown or ended class, an unknown group, and a student of another group', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    await storeClassList();
    const device = ctx.device('d1').participants;
    expect(await device.join('nope', 'g1', 's1')).toBeNull();
    expect(await device.join(session.code, 'nope', null)).toBeNull();
    expect(await device.join(session.code, 'nope', 's1')).toBeNull();
    expect(await device.join(session.code, 'g1', 's2')).toBeNull();
    expect(await device.join(session.code, 'g1', 'nobody')).toBeNull();
    await sessions.end(session.id);
    expect(await device.join(session.code, 'g1', 's1')).toBeNull();
    expect(await store.list('participants')).toEqual([]);
  });

  it('keeps the seat of a let-in device that asks again for the same group and name, writing nothing, and puts it back to waiting when it asks as someone else', async () => {
    const session = await begin();
    const device = await seated(session.id, 'g1', 's1');
    expect(await device.participants.admittedSeat(session.id)).not.toBeNull();
    const before = await ctx.store.list('participants');
    const again = await device.participants.join(session.code, 'g1', 's1');
    expect(again?.admitted).toBe(true);
    expect(await ctx.store.list('participants')).toEqual(before);
    expect(await device.participants.admittedSeat(session.id)).not.toBeNull();
    const asShared = await device.participants.join(session.code, 'g1', null);
    expect(asShared?.admitted).toBe(false);
    expect(await device.participants.admittedSeat(session.id)).toBeNull();
    expect(await device.answers.submitFromDevice(session.id, 'q1', 1)).toBe(false);
  });

  it('lets a name be asked for by a second device and keeps shared devices unlimited', async () => {
    const { store } = ctx;
    const session = await begin();
    await storeClassList();
    const [first, second, shared, sharedToo] = ['d1', 'd2', 'd3', 'd4'].map(ctx.participants);
    expect(await first.join(session.code, 'g1', 's1')).not.toBeNull();
    expect(await second.join(session.code, 'g1', 's1')).not.toBeNull();
    expect(await shared.join(session.code, 'g1', null)).not.toBeNull();
    expect(await sharedToo.join(session.code, 'g1', null)).not.toBeNull();
    expect(await store.list('participants', { sessionId: session.id })).toHaveLength(4);
  });

  it('moves a name to the device that is let in, removing every other seat of that student', async () => {
    const { store, participants } = ctx;
    const session = await begin();
    const dead = await seated(session.id, 'g1', 's1');
    const [other, shared] = [await seated(session.id, 'g1', 's3'), await seated(session.id, 'g1', null)];
    const fresh = participants('fresh');
    const waiting = (await fresh.join(session.code, 'g1', 's1'))!;
    expect(await store.list('participants', { sessionId: session.id })).toHaveLength(4);
    await ctx.admission.admit(waiting.id, 's1');
    const seats = await store.list('participants', { sessionId: session.id });
    expect(seats.filter((p) => p.studentId === 's1').map((p) => [p.id, p.admitted])).toEqual([[waiting.id, true]]);
    expect(seats).toHaveLength(3);
    expect(await dead.participants.admittedSeat(session.id)).toBeNull();
    expect(await other.participants.admittedSeat(session.id)).not.toBeNull();
    expect(await shared.participants.admittedSeat(session.id)).not.toBeNull();
  });

  it('lets a card admit a name only when exactly one device waits for it, and a tap picks the right one', async () => {
    const { store, participants } = ctx;
    const session = await begin();
    await storeClassList();
    const [a, b, lone] = ['a', 'b', 'lone'].map(participants);
    const seatA = (await a.join(session.code, 'g1', 's1'))!;
    const seatB = (await b.join(session.code, 'g1', 's1'))!;
    await lone.join(session.code, 'g1', 's3');
    const admitted = async () => (await store.list('participants', { sessionId: session.id })).filter((p) => p.admitted).map((p) => p.studentId);

    await ctx.admission.takeRoll(session.id, ['s1', 's3']);
    expect(await admitted()).toEqual(['s3']);

    await ctx.admission.admit(seatB.id, 's1');
    const left = await store.list('participants', { sessionId: session.id });
    expect(left.some((p) => p.id === seatA.id)).toBe(false);
    expect(left.find((p) => p.id === seatB.id)?.admitted).toBe(true);
  });

  it('admits every waiting device with one press except those whose name is held or asked for twice, for the admin only', async () => {
    const { store, auth, participants } = ctx;
    const session = await begin();
    await storeClassList();
    const [a, b, twinOne, twinTwo, shared] = ['a', 'b', 'twin1', 'twin2', 'shared'].map(participants);
    await a.join(session.code, 'g1', 's1');
    await b.join(session.code, 'g2', 's2');
    await twinOne.join(session.code, 'g1', 's3');
    await twinTwo.join(session.code, 'g1', 's3');
    await shared.join(session.code, 'g1', null);
    const admitted = async () => (await store.list('participants', { sessionId: session.id })).filter((p) => p.admitted).length;

    await auth.signOut();
    await expect(ctx.admission.admitAll(session.id)).rejects.toBeInstanceOf(NotAuthorizedError);
    await auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.admission.admitAll(session.id);
    expect(await admitted()).toBe(3);
    expect((await store.list('participants', { sessionId: session.id })).filter((p) => !p.admitted).map((p) => p.studentId)).toEqual(['s3', 's3']);
  });

  it('never lets a card move a name off an admitted device, but lets it in once the name is free', async () => {
    const { store, participants } = ctx;
    const session = await begin();
    const holder = await seated(session.id, 'g1', 's1');
    const fresh = participants('fresh');
    const waiting = (await fresh.join(session.code, 'g1', 's1'))!;
    const heldSeat = (await holder.participants.admittedSeat(session.id))!;
    await ctx.admission.takeRoll(session.id, ['s1']);
    expect((await store.list('participants', { sessionId: session.id })).map((p) => [p.id, p.admitted]).sort()).toEqual([[heldSeat.id, true], [waiting.id, false]].sort());

    await ctx.admission.remove(heldSeat.id);
    await ctx.admission.takeRoll(session.id, ['s1']);
    expect((await store.list('participants', { sessionId: session.id })).map((p) => [p.id, p.admitted])).toEqual([[waiting.id, true]]);
  });

  it('lets the teacher tap a waiting seat to move a name off an admitted device', async () => {
    const { store, participants } = ctx;
    const session = await begin();
    const holder = await seated(session.id, 'g1', 's1');
    const waiting = (await participants('fresh').join(session.code, 'g1', 's1'))!;
    await ctx.admission.admit(waiting.id, 's1');
    expect(await holder.participants.admittedSeat(session.id)).toBeNull();
    expect((await store.list('participants', { sessionId: session.id })).map((p) => [p.id, p.admitted])).toEqual([[waiting.id, true]]);
  });

  it('admits only what the teacher saw: nothing when the seat changed name, was admitted already, or vanished', async () => {
    const { store, participants } = ctx;
    const session = await begin();
    await storeClassList();
    const device = participants('d1');
    const shown = (await device.join(session.code, 'g1', 's1'))!;
    await device.join(session.code, 'g1', 's3');
    await ctx.admission.admit(shown.id, 's1');
    expect((await store.get('participants', shown.id))?.admitted).toBe(false);
    await ctx.admission.admit(shown.id, null);
    expect((await store.get('participants', shown.id))?.admitted).toBe(false);
    await ctx.admission.admit(shown.id, 's3');
    expect((await store.get('participants', shown.id))?.admitted).toBe(true);
    await ctx.admission.remove(shown.id);
    await ctx.admission.admit(shown.id, 's3');
    expect(await store.list('participants', { sessionId: session.id })).toEqual([]);
  });

  it('lets a shared device in only when the teacher saw it as shared', async () => {
    const { store, participants } = ctx;
    const session = await begin();
    await storeClassList();
    const shared = (await participants('d1').join(session.code, 'g1', null))!;
    await ctx.admission.admit(shared.id, 's1');
    expect((await store.get('participants', shared.id))?.admitted).toBe(false);
    await ctx.admission.admit(shared.id, null);
    expect((await store.get('participants', shared.id))?.admitted).toBe(true);
  });

  it('displaces nobody when the store reports the seat was not there to admit', async () => {
    const { store, participants, auth } = ctx;
    const session = await begin();
    const holder = await seated(session.id, 'g1', 's1');
    const waiting = (await participants('fresh').join(session.code, 'g1', 's1'))!;
    const losing: DocumentStore = {
      get: (collection, id) => store.get(collection, id),
      list: (collection, where) => store.list(collection, where),
      put: (collection, doc) => store.put(collection, doc),
      update: async () => false,
      remove: (collection, id) => store.remove(collection, id),
      watch: (collection, where, listener) => store.watch(collection, where, listener),
    };
    await new AdmissionService(losing, callerOf(auth), ctx.sessionRoster, ctx.sessionRoster).admit(waiting.id, 's1');
    expect(await holder.participants.admittedSeat(session.id)).not.toBeNull();
  });

  it('removes a waiting seat, for the admin only', async () => {
    const { store, auth, participants } = ctx;
    const session = await begin();
    await storeClassList();
    const device = participants('d1');
    const waiting = (await device.join(session.code, 'g1', 's1'))!;
    await auth.signOut();
    await expect(ctx.admission.remove(waiting.id)).rejects.toBeInstanceOf(NotAuthorizedError);
    await auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.admission.remove(waiting.id);
    expect(await store.list('participants', { sessionId: session.id })).toEqual([]);
    expect(await device.join(session.code, 'g1', 's1')).not.toBeNull();
  });

  it('removes an admitted seat, frees its name and leaves the other seats alone', async () => {
    const { store, auth } = ctx;
    const session = await begin();
    const inside = await seated(session.id, 'g1', 's1');
    const other = await seated(session.id, 'g1', 's3');
    const seat = (await inside.participants.admittedSeat(session.id))!;
    await auth.signOut();
    await expect(ctx.admission.remove(seat.id)).rejects.toBeInstanceOf(NotAuthorizedError);
    await auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.admission.remove(seat.id);
    expect(await inside.participants.admittedSeat(session.id)).toBeNull();
    expect(await other.participants.admittedSeat(session.id)).not.toBeNull();
    expect(await store.list('participants', { sessionId: session.id })).toHaveLength(1);
    expect(await inside.participants.join(session.code, 'g1', 's1')).not.toBeNull();
  });

  it('admits by cards only the waiting seats of the named students in that session', async () => {
    const { participants, store, auth } = ctx;
    const session = await begin();
    await storeClassList();
    const [d1, d2, d3] = ['d1', 'd2', 'd3'].map(participants);
    await d1.join(session.code, 'g1', 's1');
    await d2.join(session.code, 'g1', 's3');
    await d3.join(session.code, 'g1', null);
    await store.put('participants', { id: 'other:d9', sessionId: 'other', groupId: 'g1', studentId: 's1', joinedAt: 0, admitted: false });
    const admitted = async () => (await store.list('participants')).filter((p) => p.admitted).map((p) => p.studentId);

    await auth.signOut();
    await expect(ctx.admission.takeRoll(session.id, ['s1'])).rejects.toBeInstanceOf(NotAuthorizedError);
    await auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.admission.takeRoll(session.id, ['s1', 's9']);
    expect(await admitted()).toEqual(['s1']);
    await ctx.admission.takeRoll(session.id, ['s1']);
    expect(await admitted()).toEqual(['s1']);
  });

  it('imports a valid lesson file and saves nothing for a broken one', async () => {
    const { lessons, store } = ctx;
    const text = lessons.exportToText(lesson);
    expect((await lessons.importFromText(text, null)).ok).toBe(true);
    expect((await lessons.importFromText('{"format":"spectrum-lesson","version":1,"title":"","slides":[]}', null)).ok).toBe(false);
    expect(await store.list('lessons')).toHaveLength(2);
  });

  it('lists lessons as summaries, newest first, with their slide and question counts', async () => {
    const { lessons, store } = ctx;
    await store.put('lessons', { ...lesson, id: 'l2', title: 'أحدث', updatedAt: 5, slides: [question, { ...question, id: 'q9' }, { id: 'c1', kind: 'content', title: 'م', tag: '', body: '', images: [], hidden: '' }] });
    let seen: unknown[] = [];
    const stop = lessons.watchLessons((list) => (seen = list));
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    stop();
    expect(seen).toEqual([
      { id: 'l2', folderId: null, title: 'أحدث', subject: '', grade: '', published: true, updatedAt: 5, slideCount: 3, questionCount: 2 },
      { id: 'l1', folderId: null, title: 'درس', subject: '', grade: '', published: true, updatedAt: 0, slideCount: 2, questionCount: 2 },
    ]);
  });

  it('imports a class list as the admin only, keeping card numbers and changing nothing on a bad list', async () => {
    const { roster, store } = ctx;
    const visitor = await setup();
    await expect(visitor.roster.importFromText('c1', '5\ta\tg', 'merge')).rejects.toBeInstanceOf(NotAuthorizedError);
    const old = await roster.addGroup('c1', 'أ');
    const kept = await roster.addStudent('سلمى', old.id);
    await roster.addStudent('نور', old.id);

    const bad = await roster.importFromText('c1', '901\tx\tب\n901\ty\tب', 'replace');
    expect(bad).toEqual({ ok: false, issues: [{ code: 'duplicate-card-number', line: 2 }] });
    expect(await store.list('students')).toHaveLength(2);

    const merged = await roster.importFromText('c1', '٩٠١\tx\tب\n1\tسلمى\tب', 'merge');
    expect(merged).toEqual({ ok: true, changes: { studentsAdded: 1, studentsUpdated: 1, studentsRemoved: 0, groupsAdded: 1, groupsRemoved: 0 } });
    const students = await store.list('students');
    expect(students.map((s) => s.cardNumber).sort((a, b) => a - b)).toEqual([1, 2, 901]);
    expect(students.find((s) => s.cardNumber === 1)?.id).toBe(kept.id);

    const text = await roster.exportToText('c1', 'رقم\tاسم\tمجموعة');
    expect(text.split('\n').slice(1, 4)).toEqual(['1\tسلمى\tب', '2\tنور\tأ', '901\tx\tب']);

    const replaced = await roster.importFromText('c1', text, 'replace');
    expect(replaced).toEqual({ ok: true, changes: { studentsAdded: 0, studentsUpdated: 0, studentsRemoved: 0, groupsAdded: 0, groupsRemoved: 0 } });
    await roster.importFromText('c1', '2\tنور\tأ', 'replace');
    expect((await store.list('students')).map((s) => s.cardNumber)).toEqual([2]);
    expect((await store.list('groups')).map((g) => g.name)).toEqual(['أ']);
  });

  it('protects the roster rules', async () => {
    const { roster } = ctx;
    const group = await roster.addGroup('c1', 'أ');
    const one = await roster.addStudent('سلمى', group.id);
    const two = await roster.addStudent('نور', group.id);
    expect([one.cardNumber, two.cardNumber]).toEqual([1, 2]);
    await expect(roster.saveStudent({ ...two, cardNumber: 1 })).rejects.toBeInstanceOf(RosterError);
    await expect(roster.removeGroup(group.id)).rejects.toBeInstanceOf(RosterError);
  });

  it('refuses blank names for classes, groups, students and teachers, and trims the rest', async () => {
    const { roster, teachers, store } = ctx;
    await expect(roster.addClass('  ')).rejects.toBeInstanceOf(NameError);
    await expect(roster.renameClass('c1', '')).rejects.toBeInstanceOf(NameError);
    await expect(roster.addGroup('c1', ' ')).rejects.toBeInstanceOf(NameError);
    await expect(teachers.add('')).rejects.toBeInstanceOf(NameError);
    await expect(teachers.rename('t1', ' ')).rejects.toBeInstanceOf(NameError);
    const group = await roster.addGroup('c1', ' أ ');
    expect(group.name).toBe('أ');
    await expect(roster.saveGroup({ ...group, name: '' })).rejects.toBeInstanceOf(NameError);
    const girl = await roster.addStudent('سلمى', group.id);
    await expect(roster.addStudent(' ', group.id)).rejects.toBeInstanceOf(NameError);
    await expect(roster.saveStudent({ ...girl, name: '' })).rejects.toBeInstanceOf(NameError);
    expect((await store.get('classes', 'c1'))!.name).toBe('11-3');
    expect((await store.get('teachers', 't1'))!.name).toBe('أ. هدى');
    expect((await store.get('groups', group.id))!.name).toBe('أ');
    expect((await store.get('students', girl.id))!.name).toBe('سلمى');
  });

  it('refuses a group or a list for a class that is not stored, and a student moved to another class', async () => {
    const { roster, store } = ctx;
    await expect(roster.addGroup('nope', 'أ')).rejects.toMatchObject({ code: 'class-missing' });
    await expect(roster.importFromText('nope', '1 | سلمى | أ', 'merge')).rejects.toMatchObject({ code: 'class-missing' });
    expect(await store.list('groups')).toEqual([]);
    const other = await roster.addClass('11-4');
    const group = await roster.addGroup('c1', 'أ');
    const otherGroup = await roster.addGroup(other.id, 'ج');
    const girl = await roster.addStudent('سلمى', group.id);
    await expect(roster.saveStudent({ ...girl, groupId: otherGroup.id })).rejects.toMatchObject({ code: 'group-missing' });
    await expect(roster.saveStudent({ ...girl, groupId: 'nope' })).rejects.toMatchObject({ code: 'group-missing' });
    expect((await store.get('students', girl.id))!.groupId).toBe(group.id);
    const sister = await roster.addGroup('c1', 'ب');
    await roster.saveStudent({ ...girl, groupId: sister.id });
    expect((await store.get('students', girl.id))!.groupId).toBe(sister.id);
  });

  it('manages classes and teachers as the admin only', async () => {
    const visitor = await setup();
    await expect(visitor.roster.addClass('x')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(visitor.roster.renameClass('c1', 'x')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(visitor.roster.removeClass('c1')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(visitor.teachers.add('x')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(visitor.teachers.rename('t1', 'x')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(visitor.teachers.remove('t1')).rejects.toBeInstanceOf(NotAuthorizedError);

    const { roster, teachers, store } = ctx;
    const added = await roster.addClass('11-4');
    expect(added.order).toBe(2);
    await roster.renameClass(added.id, '11-5');
    expect((await store.get('classes', added.id))?.name).toBe('11-5');
    const teacher = await teachers.add('أ. سلمى');
    await teachers.rename(teacher.id, 'أ. سلمى علي');
    expect((await store.get('teachers', teacher.id))?.name).toBe('أ. سلمى علي');
    await teachers.remove(teacher.id);
    expect(await store.get('teachers', teacher.id)).toBeNull();
  });

  it('removes a class with its groups and students and leaves other classes alone', async () => {
    const { roster, store } = ctx;
    const other = await roster.addClass('11-4');
    const keptGroup = await roster.addGroup(other.id, 'ج');
    await roster.addStudent('ريم', keptGroup.id);
    const group = await roster.addGroup('c1', 'أ');
    await roster.addStudent('سلمى', group.id);
    await roster.removeClass('c1');
    expect(await store.get('classes', 'c1')).toBeNull();
    expect(await store.list('groups')).toEqual([keptGroup]);
    expect((await store.list('students')).map((s) => s.name)).toEqual(['ريم']);
  });

  it('keeps a class and a teacher that a live class uses', async () => {
    const { roster, teachers, sessions, store } = ctx;
    const session = await begin();
    await expect(roster.removeClass('c1')).rejects.toMatchObject({ code: 'class-in-use' });
    await expect(teachers.remove('t1')).rejects.toBeInstanceOf(TeacherError);
    expect(await store.get('classes', 'c1')).not.toBeNull();
    await sessions.end(session.id);
    await teachers.remove('t1');
    await roster.removeClass('c1');
    expect(await store.get('teachers', 't1')).toBeNull();
    expect(await store.get('classes', 'c1')).toBeNull();
  });

  it('lets two classes both hold card 1, and the import and export touch only the class asked for', async () => {
    const { roster, store } = ctx;
    const other = await roster.addClass('11-4');
    const otherGroup = await roster.addGroup(other.id, 'ج');
    const group = await roster.addGroup('c1', 'أ');
    const mine = await roster.addStudent('سلمى', group.id);
    const theirs = await roster.addStudent('ريم', otherGroup.id);
    expect([mine.cardNumber, theirs.cardNumber]).toEqual([1, 1]);
    await roster.saveStudent({ ...theirs, name: 'ريم علي' });

    await roster.importFromText(other.id, '5\tهدى\tج', 'replace');
    expect((await store.list('students')).map((s) => s.name).sort()).toEqual(['سلمى', 'هدى'].sort());
    expect(await store.get('students', mine.id)).toEqual(mine);
    const text = await roster.exportToText('c1', 'رقم\tاسم\tمجموعة');
    expect(text.split('\n').slice(1, 2)).toEqual(['1\tسلمى\tأ']);
    await roster.removeClass(other.id);
    expect(await store.get('students', mine.id)).toEqual(mine);
  });

  it('refuses to start without a stored lesson, class or teacher, and stores the names', async () => {
    const { sessions, roster, teachers, store } = ctx;
    expect(await sessions.start('nope', 'c1', 't1')).toBeNull();
    expect(await sessions.start(lesson.id, 'nope', 't1')).toBeNull();
    expect(await sessions.start(lesson.id, 'c1', 'nope')).toBeNull();
    expect(await sessions.start(lesson.id, 'c1', 't1')).toBeNull();
    expect(await store.list('sessions')).toEqual([]);
    expect(await store.list('rosters')).toEqual([]);

    const started = await begin();
    expect(started).toMatchObject({ classId: 'c1', className: '11-3', teacherId: 't1', teacherName: 'أ. هدى', status: 'live' });

    await roster.renameClass('c1', '11-9');
    await teachers.rename('t1', 'أ. نورة');
    expect(await store.get('sessions', started.id)).toMatchObject({ className: '11-3', teacherName: 'أ. هدى' });
  });

  it('seats a device only in a group of the class the session is for', async () => {
    const { roster, store } = ctx;
    await storeClassList();
    const other = await roster.addClass('11-4');
    const otherGroup = await roster.addGroup(other.id, 'ج');
    const session = await begin();
    expect(await ctx.participants('d1').join(session.code, otherGroup.id, null)).toBeNull();
    expect(await ctx.participants('d1').join(session.code, 'g1', null)).not.toBeNull();
    expect(await store.list('participants')).toHaveLength(1);
  });

  it('starts with its own copy of the class groups and students, keeping their ids', async () => {
    const { store } = ctx;
    const session = await begin();
    const copy = (await store.get('rosters', session.id))!;
    expect(copy.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(copy.students.map((s) => [s.id, s.name, s.cardNumber, s.groupId])).toEqual([
      ['s1', 'سلمى أحمد', 1, 'g1'],
      ['s2', 'نور خالد', 2, 'g2'],
      ['s3', 'ليلى سعيد', 3, 'g1'],
    ]);
  });

  it('does not follow the class list after the start, and does not change it either', async () => {
    const { roster, sessionRoster, store } = ctx;
    const session = await begin();
    await roster.saveStudent({ ...salma, name: 'سلمى علي', groupId: 'g2', cardNumber: 9 });
    await roster.saveGroup({ id: 'g1', classId: 'c1', name: 'الأولى', color: '#000', order: 1 });
    await roster.removeStudent('s3');
    const kept = await sessionRoster.rosterOf(session.id);
    expect(kept.students.find((s) => s.id === 's1')).toEqual(salma);
    expect(kept.students.map((s) => s.id)).toContain('s3');
    expect(kept.groups[0].name).toBe('أ');

    await sessionRoster.moveStudent(session.id, 's2', 'g1');
    await sessionRoster.addStudent(session.id, 'هدى', 'g1');
    await sessionRoster.renameGroup(session.id, 'g2', 'اليوم');
    expect(await store.get('students', 's2')).toEqual(nour);
    expect((await store.list('students')).map((s) => s.name)).not.toContain('هدى');
    expect((await store.get('groups', 'g2'))!.name).toBe('ب');
  });

  it('lets only the admin regroup a running class, and only with ids the roster has', async () => {
    const { sessionRoster, sessions, auth } = ctx;
    const session = await begin();
    expect(await sessionRoster.moveStudent(session.id, 's1', 'g9')).toBe(false);
    expect(await sessionRoster.moveStudent(session.id, 's9', 'g2')).toBe(false);
    expect(await sessionRoster.addStudent(session.id, 'هدى', 'g9')).toBeNull();
    expect(await sessionRoster.addStudent(session.id, ' ', 'g1')).toBeNull();
    expect(await sessionRoster.renameGroup(session.id, 'g1', '')).toBe(false);
    expect(await sessionRoster.moveStudent('nope', 's1', 'g2')).toBe(false);
    await auth.signOut();
    await expect(sessionRoster.moveStudent(session.id, 's1', 'g2')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(sessionRoster.addStudent(session.id, 'هدى', 'g1')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(sessionRoster.renameGroup(session.id, 'g1', 'س')).rejects.toBeInstanceOf(NotAuthorizedError);
    await auth.signIn({ password: 'secret', code: await validCode() });
    await sessions.end(session.id);
    expect(await sessionRoster.moveStudent(session.id, 's1', 'g2')).toBe(false);
    expect((await sessionRoster.rosterOf(session.id)).students[0].groupId).toBe('g1');
  });

  it('gives a student added for today the lowest free card number, a seat, answers and hearts', async () => {
    const { sessionRoster, store } = ctx;
    const session = await begin();
    const added = (await sessionRoster.addStudent(session.id, 'هدى', 'g2'))!;
    expect(added.cardNumber).toBe(4);
    const girl = await seated(session.id, 'g2', added.id);
    expect(await girl.answers.submitFromDevice(session.id, 'q1', 1)).toBe(true);
    expect(await girl.rewards.giveAsPeer(session.id, 's1')).toBe(true);
    const groupmate = await seated(session.id, 'g1', 's1');
    expect(await groupmate.rewards.giveAsPeer(session.id, added.id)).toBe(true);
    expect(await ctx.rewards.giveAsTeacher(session.id, { kind: 'student', id: added.id })).toBe(true);
    expect(await ctx.answers.submitForStudent(session.id, 'q1', added.id, 0, 'manual')).toBe(true);
    expect((await store.list('answers', { sessionId: session.id })).map((a) => a.subject.id)).toEqual([added.id]);
    expect(await store.get('students', added.id)).toBeNull();
  });

  it('judges a seat by the group her student is in now, not the group she joined', async () => {
    const { sessionRoster, sessions, store } = ctx;
    const session = await begin();
    const moving = await seated(session.id, 'g1', 's1');
    const staying = await seated(session.id, 'g1', 's3');
    const shared = await seated(session.id, 'g1', null);
    await sessions.goTo(session.id, 1);
    expect(await staying.rewards.giveAsPeer(session.id, 's1')).toBe(false);
    await sessionRoster.moveStudent(session.id, 's1', 'g2');

    expect(await staying.rewards.giveAsPeer(session.id, 's1')).toBe(true);
    expect(await moving.rewards.giveAsPeer(session.id, 's3')).toBe(true);
    expect(await moving.rewards.giveAsPeer(session.id, 's2')).toBe(false);
    expect(await moving.answers.submitFromDevice(session.id, 'q2', 'جوابنا')).toBe(true);
    expect(await shared.answers.submitFromDevice(session.id, 'q2', 'جواب القديمة')).toBe(true);
    const bySubject = (await store.list('answers', { sessionId: session.id })).map((a) => `${a.subject.kind}:${a.subject.id}`).sort();
    expect(bySubject).toEqual(['group:g1', 'group:g2']);
  });

  it('refuses a student who is on the class list but not on this session roster', async () => {
    const { store, rewards, answers, admission, roster } = ctx;
    const session = await begin();
    const latecomer = await roster.addStudent('متأخرة', 'g1');
    const device = ctx.device('late');
    expect(await device.participants.join(session.code, 'g1', latecomer.id)).toBeNull();
    expect(await answers.submitForStudent(session.id, 'q1', latecomer.id, 0, 'card')).toBe(false);
    expect(await rewards.giveAsTeacher(session.id, { kind: 'student', id: latecomer.id })).toBe(false);
    await store.put('participants', { id: 'late-seat', sessionId: session.id, groupId: 'g1', studentId: latecomer.id, joinedAt: 1, admitted: false });
    await admission.admit('late-seat', latecomer.id);
    await admission.admitAll(session.id);
    expect((await store.get('participants', 'late-seat'))!.admitted).toBe(false);
    expect((await ctx.sessionRoster.rosterOf(session.id)).students.map((student) => student.id)).not.toContain(latecomer.id);
    expect(await store.list('answers', { sessionId: session.id })).toEqual([]);
    expect(await store.list('rewards', { sessionId: session.id })).toEqual([]);
  });

  it('accepts no change at all once the class has ended', async () => {
    const { sessions, store, admission, sessionRoster, participants } = ctx;
    const session = await begin();
    const insider = await seated(session.id, 'g1', 's1');
    const insiderSeat = (await insider.participants.admittedSeat(session.id))!;
    const waiting = (await participants('waiting').join(session.code, 'g2', 's2'))!;
    await participants('mate').join(session.code, 'g1', 's3');
    await sessions.goTo(session.id, 1);
    await sessions.end(session.id);
    const frozen = async () =>
      JSON.stringify([
        await store.get('sessions', session.id),
        await store.list('participants', { sessionId: session.id }),
        await store.get('rosters', session.id),
        await store.list('answers', { sessionId: session.id }),
        await store.list('rewards', { sessionId: session.id }),
      ]);
    const before = await frozen();

    await sessions.goTo(session.id, 0);
    await sessions.reveal(session.id, 'q1');
    await sessions.setPacing(session.id, ['g1'], 'hold');
    await sessions.sendMessage(session.id, 'مرحبا', null);
    await sessions.clearMessage(session.id);
    await sessions.end(session.id);
    await admission.admit(waiting.id, 's2');
    await admission.takeRoll(session.id, ['s1', 's2', 's3']);
    await admission.admitAll(session.id);
    await admission.remove(insiderSeat.id);
    await insider.participants.leave(session.id);
    expect(await insider.participants.join(session.code, 'g1', 's1')).toBeNull();
    expect(await insider.answers.submitFromDevice(session.id, 'q1', 0)).toBe(false);
    expect(await insider.rewards.giveAsPeer(session.id, 'nour')).toBe(false);
    expect(await ctx.answers.submitForStudent(session.id, 'q1', 's2', 0, 'manual')).toBe(false);
    expect(await sessionRoster.moveStudent(session.id, 's1', 'g2')).toBe(false);
    expect(await sessionRoster.addStudent(session.id, 'هدى', 'g1')).toBeNull();
    expect(await sessionRoster.renameGroup(session.id, 'g1', 'س')).toBe(false);
    expect(await sessionRoster.markAbsent(session.id, 's1')).toBe(false);
    expect(await sessionRoster.markPresent(session.id, 's1')).toBe(false);

    expect(await frozen()).toBe(before);
    expect((await store.get('sessions', session.id))!.status).toBe('ended');
  });

  it('takes the teacher\'s heart after the class has ended, but not a student\'s, nor one for a target off the roster', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    const insider = await seated(session.id, 'g2', 's2');
    await sessions.end(session.id);
    expect(await insider.rewards.giveAsPeer(session.id, 's1')).toBe(false);
    expect(await ctx.rewards.giveAsTeacher(session.id, { kind: 'student', id: 'nobody' })).toBe(false);
    expect(await ctx.rewards.giveAsTeacher(session.id, { kind: 'student', id: 's1' })).toBe(true);
    expect(await ctx.rewards.giveAsTeacher(session.id, { kind: 'group', id: 'g1' })).toBe(true);
    expect((await store.list('rewards', { sessionId: session.id })).map((r) => [r.source, r.target])).toEqual([
      ['teacher', { kind: 'student', id: 's1' }],
      ['teacher', { kind: 'group', id: 'g1' }],
    ]);
  });

  it('lets only the admin set the minimum of interactions, in a live class, kept within the lesson, and keeps the default as no setting', async () => {
    const { sessions, store, auth } = ctx;
    const session = await begin();
    const stored = async () => (await store.get('sessions', session.id))!;
    expect('minInteractions' in session).toBe(false);
    await sessions.setMinInteractions(session.id, 5);
    expect((await stored()).minInteractions).toBe(1);
    await sessions.setMinInteractions(session.id, -4);
    expect('minInteractions' in (await stored())).toBe(false);
    await sessions.setMinInteractions(session.id, 1);
    await sessions.setMinInteractions(session.id, NaN);
    expect((await stored()).minInteractions).toBe(1);
    await sessions.setMinInteractions(session.id, 0);
    expect('minInteractions' in (await stored())).toBe(false);
    await sessions.setMinInteractions(session.id, 1);
    await auth.signOut();
    await expect(sessions.setMinInteractions(session.id, 0)).rejects.toBeInstanceOf(NotAuthorizedError);
    await auth.signIn({ password: 'secret', code: await validCode() });
    await sessions.end(session.id);
    await sessions.setMinInteractions(session.id, 0);
    expect((await stored()).minInteractions).toBe(1);
  });

  it('keeps the rosters and rolls of two classes of the same lesson apart', async () => {
    const { sessionRoster } = ctx;
    const first = await begin();
    const second = await begin();
    await sessionRoster.moveStudent(first.id, 's1', 'g2');
    await ctx.admission.takeRoll(first.id, ['s1']);
    expect((await sessionRoster.rosterOf(first.id)).students.find((s) => s.id === 's1')!.groupId).toBe('g2');
    expect((await sessionRoster.rosterOf(second.id)).students.find((s) => s.id === 's1')!.groupId).toBe('g1');
    expect((await sessionRoster.rosterOf(first.id)).present).toEqual(['s1']);
    expect((await sessionRoster.rosterOf(second.id)).present).toBeNull();
  });

  it('refuses a seat of class A in class B', async () => {
    const { roster, store } = ctx;
    const first = await begin();
    const other = await roster.addClass('11-4');
    const otherGroup = await roster.addGroup(other.id, 'ج');
    const otherStudent = await roster.addStudent('ريم', otherGroup.id);
    await ctx.teachers.add('أ. سلمى');
    const second = (await ctx.sessions.start(lesson.id, other.id, 't1'))!;
    expect(await ctx.participants('a').join(second.code, 'g1', 's1')).toBeNull();
    expect(await ctx.participants('a').join(first.code, otherGroup.id, otherStudent.id)).toBeNull();
    expect(await ctx.participants('a').join(second.code, otherGroup.id, otherStudent.id)).not.toBeNull();
    expect(await store.list('participants')).toHaveLength(1);
  });

  it('shows a moved student her new group on a group question, and records her tap there', async () => {
    const { sessionRoster, sessions, store } = ctx;
    const session = await begin();
    const moving = await seated(session.id, 'g1', 's1');
    await sessions.goTo(session.id, 1);
    await sessionRoster.moveStudent(session.id, 's1', 'g2');
    expect(await moving.answers.submitFromDevice(session.id, 'q2', 'جوابنا')).toBe(true);
    const stored = await store.list('answers', { sessionId: session.id });
    const seat = (await moving.participants.admittedSeat(session.id))!;
    const { students } = await sessionRoster.rosterOf(session.id);
    expect(stored.map((a) => a.subject)).toEqual([{ kind: 'group', id: seatAnswerer(seat, students).groupId }]);
    expect(stored[0].subject.id).toBe('g2');
  });

  it('does not write the roster again when a second sighting of the same card adds nobody', async () => {
    const { admission, store } = ctx;
    const session = await begin();
    await seated(session.id, 'g1', 's1');
    await admission.takeRoll(session.id, ['s1']);
    const writes = vi.spyOn(MemoryStorage.prototype, 'setItem');
    await admission.takeRoll(session.id, ['s1']);
    await admission.takeRoll(session.id, ['s1', 'nobody']);
    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
    expect((await store.get('rosters', session.id))!.present).toEqual(['s1']);
  });

  it('writes the roll once when a card lets a waiting device in', async () => {
    const { admission, participants, store } = ctx;
    const session = await begin();
    await participants('waiting').join(session.code, 'g1', 's1');
    const roster = vi.spyOn(MemoryStorage.prototype, 'setItem');
    await admission.takeRoll(session.id, ['s1']);
    const rosterWrites = roster.mock.calls.filter(([key]) => key.includes('/rosters/'));
    roster.mockRestore();
    expect(rosterWrites).toHaveLength(1);
    expect((await store.list('participants', { sessionId: session.id }))[0].admitted).toBe(true);
  });

  it('lets in only the name the stored seat holds at that moment', async () => {
    const { store, participants, auth } = ctx;
    const session = await begin();
    const waiting = (await participants('wavering').join(session.code, 'g1', 's1'))!;
    const switching: DocumentStore = {
      get: (collection, id) => store.get(collection, id),
      list: (collection, where) => store.list(collection, where),
      put: (collection, doc) => store.put(collection, doc),
      update: async (collection, id, change) => {
        if (collection === 'participants') await store.put('participants', { ...waiting, studentId: 's3' });
        return store.update(collection, id, change);
      },
      remove: (collection, id) => store.remove(collection, id),
      watch: (collection, where, listener) => store.watch(collection, where, listener),
    };
    await new AdmissionService(switching, callerOf(auth), ctx.sessionRoster, ctx.sessionRoster).admit(waiting.id, 's1');
    expect(await store.get('participants', waiting.id)).toMatchObject({ studentId: 's3', admitted: false });
    expect(await store.get('rosters', session.id)).toMatchObject({ present: null });
  });

  it('keeps pacing and messages to the groups of the session and cleans the text', async () => {
    const { sessions, store } = ctx;
    const session = await begin();
    await sessions.setPacing(session.id, ['g1', 'g9'], 'hold');
    expect(Object.keys((await store.get('sessions', session.id))!.pacing)).toEqual(['g1']);
    await sessions.sendMessage(session.id, '   ', null);
    await sessions.sendMessage(session.id, 'مرحبا', 'g9');
    expect((await store.get('sessions', session.id))!.message).toBeNull();
    await sessions.sendMessage(session.id, `  ${'س'.repeat(MAX_MESSAGE_LENGTH + 20)} `, 'g2');
    const { message } = (await store.get('sessions', session.id))!;
    expect(message).toMatchObject({ groupId: 'g2' });
    expect(message!.text).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  describe('who is here', () => {
    const rollOf = async (sessionId: string) => (await ctx.store.get('rosters', sessionId))!.present;

    it('starts a class with no roll', async () => {
      const session = await begin();
      expect(await rollOf(session.id)).toBeNull();
    });

    it('marks the cards seen present and admits their waiting devices in one call, never moving a name', async () => {
      const { store, participants } = ctx;
      const session = await begin();
      const holder = await seated(session.id, 'g1', 's1');
      const heldSeat = (await holder.participants.admittedSeat(session.id))!;
      await participants('mate').join(session.code, 'g1', 's3');
      const rival = (await participants('rival').join(session.code, 'g1', 's1'))!;

      await ctx.admission.takeRoll(session.id, ['s1', 's3', 's2', 'nobody']);
      expect((await rollOf(session.id))!.slice().sort()).toEqual(['s1', 's2', 's3']);
      const seats = await store.list('participants', { sessionId: session.id });
      expect(seats.find((p) => p.studentId === 's3')?.admitted).toBe(true);
      expect(seats.find((p) => p.id === rival.id)?.admitted).toBe(false);
      expect(seats.find((p) => p.id === heldSeat.id)?.admitted).toBe(true);
    });

    it('starts a roll with a card whether or not she has a device, and with none seen starts none', async () => {
      const session = await begin();
      await ctx.admission.takeRoll(session.id, []);
      expect(await rollOf(session.id)).toBeNull();
      await ctx.admission.takeRoll(session.id, ['s2']);
      expect(await rollOf(session.id)).toEqual(['s2']);
    });

    it('starts a roll when a device is let in by tap, by let everyone in, and by card', async () => {
      const tapped = await begin();
      const seat = (await ctx.participants('a').join(tapped.code, 'g1', 's1'))!;
      await ctx.admission.admit(seat.id, 's1');
      expect(await rollOf(tapped.id)).toEqual(['s1']);

      const everyone = await begin();
      await ctx.participants('b').join(everyone.code, 'g1', 's1');
      await ctx.participants('c').join(everyone.code, 'g2', 's2');
      await ctx.participants('d').join(everyone.code, 'g1', null);
      await ctx.admission.admitAll(everyone.id);
      expect((await rollOf(everyone.id))!.slice().sort()).toEqual(['s1', 's2', 's3']);

      const carded = await begin();
      await ctx.participants('e').join(carded.code, 'g2', 's2');
      await ctx.admission.takeRoll(carded.id, ['s2']);
      expect(await rollOf(carded.id)).toEqual(['s2']);
    });

    describe('a shared device of a group', () => {
      const sorted = async (sessionId: string) => (await rollOf(sessionId))!.slice().sort();
      const askShared = async (sessionId: string, groupId: string) => (await ctx.participants(`shared-${groupId}`).join((await ctx.store.get('sessions', sessionId))!.code, groupId, null))!;

      it('puts exactly the students of its group on the roll when it is let in, starting a roll if none was taken', async () => {
        const session = await begin();
        await ctx.admission.admit((await askShared(session.id, 'g1')).id, null);
        expect(await sorted(session.id)).toEqual(['s1', 's3']);
      });

      it('adds its group to a roll that exists and leaves the others on it', async () => {
        const session = await begin();
        await ctx.admission.takeRoll(session.id, ['s2']);
        await ctx.admission.admit((await askShared(session.id, 'g1')).id, null);
        expect(await sorted(session.id)).toEqual(['s1', 's2', 's3']);
      });

      it('puts the groups of every shared device that let everyone in admits on the roll, and a group without one stays off', async () => {
        const session = await begin();
        await askShared(session.id, 'g2');
        await ctx.admission.admitAll(session.id);
        expect(await sorted(session.id)).toEqual(['s2']);
      });

      it('is not admitted by the card sweep, which marks only the cards seen', async () => {
        const session = await begin();
        const seat = await askShared(session.id, 'g1');
        await ctx.admission.takeRoll(session.id, ['s2']);
        expect((await ctx.store.get('participants', seat.id))!.admitted).toBe(false);
        expect(await sorted(session.id)).toEqual(['s2']);
      });

      it('leaves a student the teacher marks absent afterwards off the roll, also when the device is let in again', async () => {
        const { sessionRoster } = ctx;
        const session = await begin();
        const seat = await askShared(session.id, 'g1');
        await ctx.admission.admit(seat.id, null);
        expect(await sessionRoster.markAbsent(session.id, 's3')).toBe(true);
        expect(await sorted(session.id)).toEqual(['s1']);
        await ctx.admission.admit(seat.id, null);
        expect(await sorted(session.id)).toEqual(['s1']);
      });

      it('changes nothing on the roll when it is removed', async () => {
        const session = await begin();
        const seat = await askShared(session.id, 'g1');
        await ctx.admission.admit(seat.id, null);
        await ctx.admission.remove(seat.id);
        expect(await sorted(session.id)).toEqual(['s1', 's3']);
      });

      it('covers the present students of its group when it answers an individual question, and not one marked absent', async () => {
        const session = await begin();
        const { answers } = await seated(session.id, 'g1', null);
        await ctx.sessionRoster.markAbsent(session.id, 's3');
        await answers.submitFromDevice(session.id, 'q1', 0);
        const roster = (await ctx.store.get('rosters', session.id))!;
        const stored = await ctx.store.list('answers', { sessionId: session.id });
        const covered = roster.students.filter((student) => effectiveAnswer(roster, stored, question, student.id) !== null);
        expect(covered.map((student) => student.id)).toEqual(['s1']);
      });
    });

    it('adds a student whose answer the teacher enters to a roll that exists, but starts none', async () => {
      const session = await begin();
      expect(await ctx.answers.submitForStudent(session.id, 'q1', 's1', 0, 'card')).toBe(true);
      expect(await rollOf(session.id)).toBeNull();
      await ctx.admission.takeRoll(session.id, ['s2']);
      expect(await ctx.answers.submitForStudent(session.id, 'q1', 's1', 0, 'manual')).toBe(true);
      expect((await rollOf(session.id))!.slice().sort()).toEqual(['s1', 's2']);
    });

    it('does not add a student whose answer was refused', async () => {
      const session = await begin();
      await ctx.admission.takeRoll(session.id, ['s2']);
      expect(await ctx.answers.submitForStudent(session.id, 'q2', 's1', 'x', 'manual')).toBe(false);
      expect(await rollOf(session.id)).toEqual(['s2']);
    });

    it('marks a student absent from everyone when no roll exists, and present again by hand', async () => {
      const { sessionRoster } = ctx;
      const session = await begin();
      expect(await sessionRoster.markPresent(session.id, 's1')).toBe(true);
      expect(await rollOf(session.id)).toBeNull();
      expect(await sessionRoster.markAbsent(session.id, 's1')).toBe(true);
      expect((await rollOf(session.id))!.slice().sort()).toEqual(['s2', 's3']);
      expect(await sessionRoster.markPresent(session.id, 's1')).toBe(true);
      expect((await rollOf(session.id))!.slice().sort()).toEqual(['s1', 's2', 's3']);
    });

    it('keeps the roll when students are moved, renamed or added, and puts a student added for today on it', async () => {
      const { sessionRoster } = ctx;
      const session = await begin();
      await sessionRoster.markAbsent(session.id, 's1');
      await sessionRoster.moveStudent(session.id, 's3', 'g2');
      await sessionRoster.renameGroup(session.id, 'g1', 'جديدة');
      expect((await rollOf(session.id))!.slice().sort()).toEqual(['s2', 's3']);
      const added = (await sessionRoster.addStudent(session.id, 'هدى', 'g1'))!;
      expect((await rollOf(session.id))!).toContain(added.id);

      const noRoll = await begin();
      const counted = (await sessionRoster.addStudent(noRoll.id, 'سارة', 'g1'))!;
      expect(counted).not.toBeNull();
      expect(await rollOf(noRoll.id)).toBeNull();
    });

    it('is for the admin only, refuses ids not on the roster, and refuses an ended class', async () => {
      const { auth, sessionRoster, sessions } = ctx;
      const session = await begin();
      expect(await sessionRoster.markAbsent(session.id, 'nobody')).toBe(false);
      expect(await sessionRoster.markPresent(session.id, 'nobody')).toBe(false);
      expect(await rollOf(session.id)).toBeNull();
      await auth.signOut();
      await expect(sessionRoster.markAbsent(session.id, 's1')).rejects.toBeInstanceOf(NotAuthorizedError);
      await expect(sessionRoster.markPresent(session.id, 's1')).rejects.toBeInstanceOf(NotAuthorizedError);
      await expect(ctx.admission.takeRoll(session.id, ['s1'])).rejects.toBeInstanceOf(NotAuthorizedError);
      await auth.signIn({ password: 'secret', code: await validCode() });
      await sessions.end(session.id);
      expect(await sessionRoster.markAbsent(session.id, 's1')).toBe(false);
      expect(await sessionRoster.markPresent(session.id, 's1')).toBe(false);
      await ctx.admission.takeRoll(session.id, ['s1']);
      expect(await rollOf(session.id)).toBeNull();
    });
  });
});

describe('the kept record of an ended class', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
    await ctx.auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.store.put('lessons', lesson);
    await ctx.store.put('classes', { id: 'c1', name: '11-3', order: 1 });
    await ctx.store.put('teachers', { id: 't1', name: 'أ. هدى', order: 1 });
    await ctx.store.put('groups', { id: 'g1', classId: 'c1', name: 'أ', color: '#000', order: 1 });
    await ctx.store.put('students', { id: 's1', name: 'سلمى أحمد', cardNumber: 1, groupId: 'g1' });
  });
  const begin = async () => (await ctx.sessions.start('l1', 'c1', 't1'))!;

  it('is written once when the class ends, from the answers it had', async () => {
    const session = await begin();
    await ctx.answers.submitForStudent(session.id, 'q1', 's1', 0, 'manual');
    expect(await ctx.store.list('records')).toEqual([]);
    await ctx.sessions.end(session.id);
    const [record] = await ctx.store.list('records');
    expect(record).toMatchObject({ id: session.id, classId: 'c1', startedAt: session.startedAt });
    expect(record.students).toEqual([{ studentId: 's1', name: 'سلمى أحمد', groupId: 'g1', present: true, answered: 1, points: 1, unresponsive: false }]);
  });

  it('is not rewritten by ending again, even after the lesson changed, and is made when it is missing', async () => {
    const session = await begin();
    await ctx.answers.submitForStudent(session.id, 'q1', 's1', 0, 'manual');
    await ctx.sessions.end(session.id);
    const [kept] = await ctx.store.list('records');
    await ctx.lessons.save({ ...lesson, slides: [] });
    await ctx.sessions.end(session.id);
    expect(await ctx.store.list('records')).toEqual([kept]);
    await ctx.store.remove('records', session.id);
    await ctx.sessions.end(session.id);
    expect((await ctx.store.list('records')).map((r) => r.groups[0].max)).toEqual([0]);
  });

  it('is not made for a live class, an unknown class or an ended class whose lesson is gone', async () => {
    const session = await begin();
    await ctx.records.keep(session.id);
    await ctx.records.keep('nobody');
    await ctx.store.put('sessions', { ...session, status: 'ended', lessonId: 'gone' });
    await ctx.records.keep(session.id);
    expect(await ctx.store.list('records')).toEqual([]);
  });

  it('names the week and the month of now', async () => {
    for (const kind of ['week', 'month'] as const) expect(inPeriod(ctx.records.currentPeriod(kind), Date.now())).toBe(true);
  });

  it('cannot be asked of by a visitor', async () => {
    await ctx.auth.signOut();
    await expect(ctx.records.keep('x')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(ctx.records.standingsOf('c1', periodAt('week', NOW))).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('keeps a lesson that a running class uses', async () => {
    const session = await begin();
    await expect(ctx.lessons.remove(['l1'])).rejects.toBeInstanceOf(LessonError);
    expect(await ctx.store.get('lessons', 'l1')).not.toBeNull();
    await ctx.sessions.end(session.id);
    await ctx.lessons.remove(['l1']);
    expect(await ctx.store.get('lessons', 'l1')).toBeNull();
    expect(await ctx.store.list('records')).toHaveLength(1);
  });

  it('sums the ended classes of one class list over a period, with hearts given after the end', async () => {
    const session = await begin();
    await ctx.answers.submitForStudent(session.id, 'q1', 's1', 0, 'manual');
    await ctx.sessions.end(session.id);
    await ctx.rewards.giveAsTeacher(session.id, { kind: 'student', id: 's1' });
    const [{ startedAt }] = await ctx.store.list('records');
    const result = await ctx.records.standingsOf('c1', periodAt('month', startedAt));
    expect(result.classes).toBe(1);
    expect(result.students).toEqual([{ studentId: 's1', name: 'سلمى أحمد', classes: 1, attended: 1, answered: 1, points: 1, hearts: 1, unresponsive: 0 }]);
    expect(result.groups).toEqual([{ groupId: 'g1', name: 'أ', score: 1, max: question.points + groupQuestion.points, hearts: 1 }]);
    expect((await ctx.records.standingsOf('other', periodAt('month', startedAt))).classes).toBe(0);
    expect((await ctx.records.standingsOf('c1', periodAt('month', 0))).classes).toBe(0);
  });

  it('gives a visitor the groups\' totals only, and her own line only through the seat she was let in at', async () => {
    const session = await begin();
    const device = ctx.device('d1');
    const mine = (await device.participants.join(session.code, 'g1', 's1'))!;
    const waitingLine = await device.records.ownStandingIn(session.id, 'month');
    await ctx.admission.admit(mine.id, 's1');
    await ctx.answers.submitForStudent(session.id, 'q1', 's1', 0, 'manual');
    const other = ctx.device('d2');
    const shared = (await other.participants.join(session.code, 'g1', null))!;
    await ctx.admission.admit(shared.id, null);
    const stranger = ctx.device('d3');
    await ctx.sessions.end(session.id);
    await ctx.rewards.giveAsTeacher(session.id, { kind: 'student', id: 's1' });
    await ctx.auth.signOut();

    const period = periodAt('month', session.startedAt);
    expect(waitingLine).toBeNull();
    expect(await device.records.groupStandingsOf(session.code, period.kind)).toEqual([{ groupId: 'g1', name: 'أ', score: 1, max: question.points + groupQuestion.points, hearts: 1 }]);
    expect(await stranger.records.groupStandingsOf(session.code, period.kind)).toEqual([]);
    expect(await device.records.ownStandingIn(session.id, period.kind)).toEqual({ classes: 1, attended: 1, points: 1, hearts: 1 });
    expect(await other.records.ownStandingIn(session.id, period.kind)).toBeNull();
    expect(await stranger.records.ownStandingIn(session.id, period.kind)).toBeNull();
    expect(await device.records.ownStandingIn('nobody', period.kind)).toBeNull();
    await expect(device.records.standingsOf('c1', period)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('gives nothing to a device whose seat was removed', async () => {
    const session = await begin();
    const device = ctx.device('d1');
    const mine = (await device.participants.join(session.code, 'g1', 's1'))!;
    await ctx.admission.admit(mine.id, 's1');
    await ctx.sessions.end(session.id);
    await ctx.store.remove('participants', mine.id);
    expect(await device.records.ownStandingIn(session.id, 'month')).toBeNull();
  });
});

describe('lesson folders', () => {
  const signedIn = async () => {
    const ctx = await setup();
    await ctx.auth.signIn({ password: 'secret', code: await validCode() });
    return ctx;
  };
  const folderIds = async (store: DocumentStore) => (await store.list('folders')).map((f) => f.id).sort();

  it('refuses every folder command and lesson move to a signed-out caller', async () => {
    const { folders, lessons } = await setup();
    await expect(folders.add('a', null)).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(folders.rename('a', 'b')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(folders.move('a', null)).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(folders.remove('a')).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(lessons.moveToFolder(['l'], null)).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(lessons.moveLessons('a', null)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('adds nested folders and refuses a blank name or an unknown parent', async () => {
    const { folders, store } = await signedIn();
    const outer = await folders.add('  خارجي ', null);
    const inner = await folders.add('داخلي', outer.id);
    expect(outer.name).toBe('خارجي');
    expect(inner.parentId).toBe(outer.id);
    await expect(folders.add('  ', null)).rejects.toBeInstanceOf(NameError);
    await expect(folders.rename(outer.id, ' ')).rejects.toBeInstanceOf(NameError);
    await expect(folders.add('x', 'gone')).rejects.toMatchObject({ code: 'folder-missing' });
    expect(await store.list('folders')).toHaveLength(2);
    await folders.rename(outer.id, 'جديد');
    expect((await store.get('folders', outer.id))?.name).toBe('جديد');
  });

  it('refuses to move a folder into itself or a descendant, and changes nothing', async () => {
    const { folders, store } = await signedIn();
    const a = await folders.add('a', null);
    const b = await folders.add('b', a.id);
    const c = await folders.add('c', b.id);
    const before = await store.list('folders');
    for (const target of [a.id, b.id, c.id]) {
      await expect(folders.move(a.id, target)).rejects.toMatchObject({ code: 'folder-inside-itself' });
    }
    await expect(folders.move(a.id, 'gone')).rejects.toBeInstanceOf(FolderError);
    await expect(folders.move('gone', null)).rejects.toMatchObject({ code: 'folder-missing' });
    expect(await store.list('folders')).toEqual(before);
  });

  it('re-parents on a valid move', async () => {
    const { folders, store } = await signedIn();
    const a = await folders.add('a', null);
    const b = await folders.add('b', null);
    await folders.move(b.id, a.id);
    expect((await store.get('folders', b.id))?.parentId).toBe(a.id);
    await folders.move(b.id, null);
    expect((await store.get('folders', b.id))?.parentId).toBeNull();
  });

  it('removes a folder by moving its subfolders and lessons to its parent first', async () => {
    const { folders, lessons, store } = await signedIn();
    const top = await folders.add('top', null);
    const mid = await folders.add('mid', top.id);
    const sub = await folders.add('sub', mid.id);
    const inMid = await lessons.create('م', mid.id);
    await folders.remove(mid.id);
    expect(await folderIds(store)).toEqual([sub.id, top.id].sort());
    expect((await store.get('folders', sub.id))?.parentId).toBe(top.id);
    expect((await store.get('lessons', inMid.id))?.folderId).toBe(top.id);
    const inTop = await lessons.create('ع', top.id);
    await folders.remove(top.id);
    expect((await store.get('folders', sub.id))?.parentId).toBeNull();
    expect((await store.get('lessons', inTop.id))?.folderId).toBeNull();
    expect((await store.get('lessons', inMid.id))?.folderId).toBeNull();
    expect(await store.list('lessons')).toHaveLength(2);
  });

  it('does nothing when removing an unknown folder', async () => {
    const { folders, store } = await signedIn();
    const a = await folders.add('a', null);
    await folders.remove('gone');
    expect(await folderIds(store)).toEqual([a.id]);
  });

  it('puts a created or imported lesson in the folder', async () => {
    const { folders, lessons, store } = await signedIn();
    const a = await folders.add('a', null);
    const made = await lessons.create('x', a.id);
    expect((await store.get('lessons', made.id))?.folderId).toBe(a.id);
    const result = await lessons.importFromText(lessons.exportToText({ ...made, slides: [question] }), a.id);
    expect(result.ok).toBe(true);
    const stored = await store.list('lessons', { folderId: a.id });
    expect(stored).toHaveLength(2);
  });

  it('refuses an unknown folder for create, import and move, and stores nothing', async () => {
    const { lessons, store } = await signedIn();
    const made = await lessons.create('x', null);
    const text = lessons.exportToText({ ...made, slides: [question] });
    await expect(lessons.create('y', 'gone')).rejects.toMatchObject({ code: 'folder-missing' });
    await expect(lessons.importFromText(text, 'gone')).rejects.toBeInstanceOf(FolderError);
    await expect(lessons.moveToFolder([made.id], 'gone')).rejects.toBeInstanceOf(FolderError);
    expect(await store.list('lessons')).toEqual([made]);
  });

  it('moves a lesson without changing when it was edited', async () => {
    const { folders, lessons, store } = await signedIn();
    const a = await folders.add('a', null);
    const made = await lessons.create('x', null);
    await lessons.moveToFolder([made.id], a.id);
    expect(await store.get('lessons', made.id)).toEqual({ ...made, folderId: a.id });
  });

  it('keeps a move when an older copy of the lesson is saved', async () => {
    const { folders, lessons, store } = await signedIn();
    const a = await folders.add('a', null);
    const stale = await lessons.create('x', null);
    await lessons.moveToFolder([stale.id], a.id);
    await lessons.save({ ...stale, title: 'محرر' });
    expect(await store.get('lessons', stale.id)).toMatchObject({ title: 'محرر', folderId: a.id });
  });

  it('does not bring a deleted lesson back when an old editor saves it', async () => {
    const { lessons, store } = await signedIn();
    const made = await lessons.create('x', null);
    await lessons.remove([made.id]);
    await expect(lessons.save({ ...made, title: 'محرر' })).rejects.toMatchObject({ code: 'lesson-missing' });
    expect(await store.list('lessons')).toEqual([]);
  });

  it('refuses to rename a missing folder or move a missing lesson', async () => {
    const { folders, lessons, store } = await signedIn();
    await expect(folders.rename('gone', 'x')).rejects.toMatchObject({ code: 'folder-missing' });
    await expect(lessons.moveToFolder(['gone'], null)).rejects.toMatchObject({ code: 'lesson-missing' });
    expect(await store.list('folders')).toEqual([]);
    expect(await store.list('lessons')).toEqual([]);
  });

  it('moves only the lessons of the source folder when its lessons are moved', async () => {
    const { folders, lessons, store } = await signedIn();
    const a = await folders.add('a', null);
    const b = await folders.add('b', null);
    const inA = await lessons.create('x', a.id);
    const inB = await lessons.create('y', b.id);
    const atTop = await lessons.create('z', null);
    await lessons.moveLessons(a.id, b.id);
    expect((await store.get('lessons', inA.id))?.folderId).toBe(b.id);
    expect(await store.get('lessons', inB.id)).toEqual(inB);
    expect(await store.get('lessons', atTop.id)).toEqual(atTop);
  });

  it('heals a stored loop at the next change so the folders really move', async () => {
    const { folders, store } = await signedIn();
    await store.put('folders', { id: 'a', name: 'a', parentId: 'b', order: 1 });
    await store.put('folders', { id: 'b', name: 'b', parentId: 'a', order: 2 });
    await folders.move('b', 'a');
    expect((await store.get('folders', 'b'))?.parentId).toBe('a');
    expect((await store.get('folders', 'a'))?.parentId).toBeNull();
  });

  it('writes the repairs of a stored tree before adding a folder', async () => {
    const { folders, store } = await signedIn();
    await store.put('folders', { id: 'a', name: 'a', parentId: 'gone', order: 1 });
    await folders.add('b', null);
    expect((await store.get('folders', 'a'))?.parentId).toBeNull();
  });

  it('removing a folder whose stored parent is dangling moves its contents to the top level', async () => {
    const { folders, lessons, store } = await signedIn();
    await store.put('folders', { id: 'a', name: 'a', parentId: 'gone', order: 1 });
    await store.put('folders', { id: 'child', name: 'c', parentId: 'a', order: 2 });
    const inside = await lessons.create('x', 'a');
    await folders.remove('a');
    expect((await store.get('folders', 'child'))?.parentId).toBeNull();
    expect((await store.get('lessons', inside.id))?.folderId).toBeNull();
    expect(await store.get('folders', 'a')).toBeNull();
  });

  it('keeps a rename made elsewhere while a folder is re-parented', async () => {
    const { folders, store } = await signedIn();
    const a = await folders.add('a', null);
    const child = await folders.add('c', a.id);
    await folders.rename(child.id, 'renamed');
    await folders.remove(a.id);
    expect(await store.get('folders', child.id)).toMatchObject({ name: 'renamed', parentId: null });
  });
});

describe('keeping and clearing class data', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  const DAY = 24 * 60 * 60 * 1000;
  const noon = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day, 12) - SCHOOL_UTC_OFFSET_MS;

  beforeEach(async () => {
    ctx = await setup();
    await ctx.auth.signIn({ password: 'secret', code: await validCode() });
    await ctx.store.put('lessons', lesson);
    await ctx.store.put('folders', { id: 'f1', name: 'مجلد', parentId: null, order: 1 });
    await ctx.store.put('classes', { id: 'c1', name: '11-3', order: 1 });
    await ctx.store.put('teachers', { id: 't1', name: 'أ. هدى', order: 1 });
    await ctx.store.put('site', { id: 'site', schoolName: 'م', title: 'ع', tagline: 'ت', intro: 'م' });
    await ctx.store.put('groups', { id: 'g1', classId: 'c1', name: 'أ', color: '#000', order: 1 });
    await ctx.store.put('students', { id: 's1', name: 'سلمى أحمد', cardNumber: 1, groupId: 'g1' });
  });

  /** An ended class with an answer, a heart, a seat, a kept record and its roster copy, started at `startedAt`. */
  const endedClass = async (startedAt: number) => {
    const session = (await ctx.sessions.start('l1', 'c1', 't1'))!;
    const device = ctx.device(`d-${session.id}`);
    const seat = (await device.participants.join(session.code, 'g1', 's1'))!;
    await ctx.admission.admit(seat.id, 's1');
    await ctx.answers.submitForStudent(session.id, 'q1', 's1', 0, 'manual');
    await ctx.sessions.end(session.id);
    await ctx.rewards.giveAsTeacher(session.id, { kind: 'student', id: 's1' });
    await ctx.store.update('sessions', session.id, (current) => ({ ...current, startedAt }));
    await ctx.store.update('records', session.id, (current) => ({ ...current, startedAt }));
    return session.id;
  };
  const childrenOf = async (sessionId: string) => [
    await ctx.store.get('sessions', sessionId),
    await ctx.store.get('records', sessionId),
    await ctx.store.get('rosters', sessionId),
    ...(await ctx.store.list('participants', { sessionId })),
    ...(await ctx.store.list('answers', { sessionId })),
    ...(await ctx.store.list('rewards', { sessionId })),
  ].filter((doc) => doc !== null);
  const day = (at: number) => dateOf(at);
  const kept = async () => ({
    lessons: await ctx.store.list('lessons'),
    folders: await ctx.store.list('folders'),
    teachers: await ctx.store.list('teachers'),
    site: await ctx.store.list('site'),
  });

  /** A store that tells each removal before it happens, so a test can interrupt a clearing midway. */
  class ObservedStore implements DocumentStore {
    removes = 0;

    constructor(
      private readonly inner: DocumentStore,
      private readonly onRemove: (nth: number) => Promise<void> | void = () => undefined,
    ) {}

    get<C extends CollectionName>(collection: C, id: Id) {
      return this.inner.get(collection, id);
    }

    list<C extends CollectionName>(collection: C, where?: Where<Collections[C]>) {
      return this.inner.list(collection, where);
    }

    put<C extends CollectionName>(collection: C, doc: Collections[C]) {
      return this.inner.put(collection, doc);
    }

    update<C extends CollectionName>(collection: C, id: Id, change: (current: Collections[C]) => Collections[C]) {
      return this.inner.update(collection, id, change);
    }

    async remove(collection: CollectionName, id: Id) {
      this.removes += 1;
      await this.onRemove(this.removes);
      await this.inner.remove(collection, id);
    }

    watch<C extends CollectionName>(collection: C, where: Where<Collections[C]>, listener: (docs: Collections[C][]) => void): Unsubscribe {
      return this.inner.watch(collection, where, listener);
    }
  }
  const retentionOver = (store: DocumentStore) => new RetentionService(store, ctx.caller, () => ctx.clock.now);
  const range = { from: { year: 2026, month: 5, day: 10 }, to: { year: 2026, month: 5, day: 12 } };

  it('refuses a signed-out caller every method', async () => {
    await ctx.auth.signOut();
    const today = day(NOW);
    await expect(ctx.retention.setYearEnd({ month: 6, day: 30 })).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(ctx.retention.classesToRemove('c1', { from: today, to: today })).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(ctx.retention.removeClasses('c1', { from: today, to: today }, [])).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(ctx.retention.clearIfDue()).rejects.toBeInstanceOf(NotAuthorizedError);
    await expect(ctx.retention.rangeLimits()).rejects.toBeInstanceOf(NotAuthorizedError);
    expect(() => ctx.retention.watchSettings(() => undefined)).toThrow(NotAuthorizedError);
    expect(() => ctx.retention.watchNotices(() => undefined)).toThrow(NotAuthorizedError);
  });

  it('refuses an impossible range and an impossible day', async () => {
    const bad = { from: { year: 2026, month: 5, day: 3 }, to: { year: 2026, month: 5, day: 2 } };
    await expect(ctx.retention.classesToRemove('c1', bad)).rejects.toMatchObject({ code: 'bad-range' });
    await expect(ctx.retention.removeClasses('c1', { from: { year: 2026, month: 2, day: 30 }, to: bad.from }, [])).rejects.toBeInstanceOf(RetentionError);
    await expect(ctx.retention.setYearEnd({ month: 4, day: 31 })).rejects.toMatchObject({ code: 'bad-year-end' });
    expect(await ctx.store.list('retention')).toEqual([]);
  });

  it('removes only the ended classes of the class list inside the range, with everything they kept', async () => {
    const inside = await endedClass(noon(2026, 5, 11));
    const before = await endedClass(noon(2026, 5, 9));
    const after = await endedClass(noon(2026, 5, 13));
    const otherList = await endedClass(noon(2026, 5, 11));
    await ctx.store.put('classes', { id: 'c2', name: 'أخرى', order: 2 });
    await ctx.store.update('sessions', otherList, (current) => ({ ...current, classId: 'c2' }));
    const running = (await ctx.sessions.start('l1', 'c1', 't1'))!;
    await ctx.store.update('sessions', running.id, (current) => ({ ...current, startedAt: noon(2026, 5, 11) }));
    const outsideBefore = [before, after, otherList, running.id].map((id) => childrenOf(id));

    const ids = await ctx.retention.classesToRemove('c1', range);
    expect(ids).toEqual([inside]);
    expect(await ctx.retention.removeClasses('c1', range, ids)).toBe(1);

    expect(await childrenOf(inside)).toEqual([]);
    expect(await Promise.all([before, after, otherList, running.id].map((id) => childrenOf(id)))).toEqual(await Promise.all(outsideBefore));
    expect(await ctx.retention.classesToRemove('c1', range)).toEqual([]);
    expect(await ctx.retention.classesToRemove('c2', range)).toEqual([otherList]);
    expect(await kept()).toMatchObject({ lessons: [lesson], folders: [expect.anything()], teachers: [expect.anything()] });
    expect(await ctx.store.list('classes')).toHaveLength(2);
    expect(await ctx.store.list('students')).toHaveLength(1);
  });

  it('removes exactly the classes that were counted, and skips any id that no longer matches', async () => {
    const counted = await endedClass(noon(2026, 5, 11));
    const [mine] = await ctx.retention.classesToRemove('c1', range);
    expect(mine).toBe(counted);
    const late = await endedClass(noon(2026, 5, 12));
    const otherList = await endedClass(noon(2026, 5, 11));
    await ctx.store.put('classes', { id: 'c2', name: 'أخرى', order: 2 });
    await ctx.store.update('sessions', otherList, (current) => ({ ...current, classId: 'c2' }));
    const outside = await endedClass(noon(2026, 6, 1));
    const restarted = await endedClass(noon(2026, 5, 10));
    await ctx.store.update('sessions', restarted, (current) => ({ ...current, status: 'live' }));
    const keptBefore = await Promise.all([late, otherList, outside, restarted].map((id) => childrenOf(id)));

    expect(await ctx.retention.removeClasses('c1', range, [counted, 'nobody', otherList, outside, restarted, counted])).toBe(1);

    expect(await childrenOf(counted)).toEqual([]);
    expect(await Promise.all([late, otherList, outside, restarted].map((id) => childrenOf(id)))).toEqual(keptBefore);
    expect(await ctx.retention.removeClasses('c1', range, [counted])).toBe(0);
  });

  it('removes nothing when the range holds no class', async () => {
    const id = await endedClass(noon(2026, 5, 11));
    const before = await childrenOf(id);
    const other = { from: { year: 2025, month: 1, day: 1 }, to: { year: 2025, month: 1, day: 2 } };
    expect(await ctx.retention.classesToRemove('c1', other)).toEqual([]);
    expect(await ctx.retention.removeClasses('c1', other, [id])).toBe(0);
    expect(await childrenOf(id)).toEqual(before);
  });

  it('no longer counts a removed class in the cumulative results', async () => {
    const gone = await endedClass(noon(2026, 5, 11));
    await endedClass(noon(2026, 5, 20));
    const month = periodAt('month', noon(2026, 5, 11));
    expect((await ctx.records.standingsOf('c1', month)).classes).toBe(2);
    const that = { from: day(noon(2026, 5, 11)), to: day(noon(2026, 5, 11)) };
    await ctx.retention.removeClasses('c1', that, await ctx.retention.classesToRemove('c1', that));
    expect(await ctx.store.get('sessions', gone)).toBeNull();
    const result = await ctx.records.standingsOf('c1', month);
    expect(result.classes).toBe(1);
    expect(result.students[0]).toMatchObject({ classes: 1, points: 1, hearts: 1 });
  });

  it('knows today, the limit of the dates to choose', async () => {
    expect(await ctx.retention.rangeLimits()).toEqual({ today: day(NOW) });
  });

  it('keeps the date of the end of the school year, and tells when it comes close', async () => {
    const seen: unknown[] = [];
    const early: unknown[] = [];
    const late: unknown[] = [];
    const stop = ctx.retention.watchSettings((settings) => seen.push(settings?.yearEnd));
    const stopEarly = ctx.retention.watchNotices((notices) => early.push(notices));
    const end = dateOf(NOW + 8 * DAY);
    await ctx.retention.setYearEnd({ month: end.month, day: end.day });
    ctx.clock.now = NOW + 3 * DAY;
    const stopLate = ctx.retention.watchNotices((notices) => late.push(notices));
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    stopEarly();
    stopLate();
    expect(seen.at(-1)).toEqual({ month: end.month, day: end.day });
    expect(early.at(-1)).toEqual({ coming: null, done: null });
    expect(late.at(-1)).toEqual({ coming: end, done: null });
  });

  describe('at the end of the school year', () => {
    const june30 = { month: 6, day: 30 };
    const setOn = async (year: number, month: number, dayOfMonth: number) => {
      ctx.clock.now = noon(year, month, dayOfMonth);
      await ctx.retention.setYearEnd(june30);
    };
    const clearedCollections = SCHOOL_YEAR_CLEARED_COLLECTIONS;
    const settings = () => ctx.store.get('retention', 'retention');

    it('does nothing before the date, nor when it is switched off', async () => {
      await setOn(2026, 1, 10);
      const id = await endedClass(noon(2026, 2, 1));
      ctx.clock.now = noon(2026, 6, 30);
      expect(await ctx.retention.clearIfDue()).toBe(false);
      expect(await childrenOf(id)).not.toEqual([]);
      await ctx.retention.setYearEnd(null);
      ctx.clock.now = noon(2027, 8, 1);
      expect(await ctx.retention.clearIfDue()).toBe(false);
      expect(await ctx.store.list('classes')).toHaveLength(1);
    });

    it('does nothing at all without any settings', async () => {
      expect(await ctx.retention.clearIfDue()).toBe(false);
    });

    it('removes every class, running ones too, and every class list, and keeps the rest', async () => {
      await setOn(2026, 1, 10);
      const ended = await endedClass(noon(2026, 2, 1));
      const running = (await ctx.sessions.start('l1', 'c1', 't1'))!;
      const before = await kept();
      ctx.clock.now = noon(2026, 7, 1);
      expect(await ctx.retention.clearIfDue()).toBe(true);

      expect(await childrenOf(ended)).toEqual([]);
      expect(await childrenOf(running.id)).toEqual([]);
      for (const collection of clearedCollections) expect(await ctx.store.list(collection)).toEqual([]);
      expect(await kept()).toEqual(before);
      expect(await settings()).toEqual({ id: 'retention', yearEnd: june30, yearEndSetAt: noon(2026, 1, 10), lastClearedAt: noon(2026, 7, 1) });
    });

    it('empties the collections whole, so no stray row survives', async () => {
      await setOn(2026, 1, 10);
      const stray: Answer = { id: 'a-stray', sessionId: 'ghost', slideId: 'q1', subject: { kind: 'student', id: 's1' }, value: 0, source: 'manual', at: 1 };
      const heart: Reward = { id: 'r-stray', sessionId: 'ghost', target: { kind: 'student', id: 's1' }, source: 'teacher', at: 1 };
      await ctx.store.put('answers', stray);
      await ctx.store.put('rewards', heart);
      await ctx.store.put('students', { id: 's-stray', name: 'بلا مجموعة', cardNumber: 9, groupId: 'no-group' });
      await ctx.store.put('groups', { id: 'g-stray', classId: 'no-class', name: 'ب', color: '#111', order: 2 });
      const running = (await ctx.sessions.start('l1', 'c1', 't1'))!;
      ctx.clock.now = noon(2026, 7, 1);

      expect(await ctx.retention.clearIfDue()).toBe(true);

      for (const collection of clearedCollections) expect(await ctx.store.list(collection)).toEqual([]);
      expect(await ctx.store.get('sessions', running.id)).toBeNull();
      expect(await ctx.store.list('lessons')).toHaveLength(1);
      expect(await ctx.store.list('folders')).toHaveLength(1);
      expect(await ctx.store.list('teachers')).toHaveLength(1);
      expect(await ctx.store.list('site')).toHaveLength(1);
    });

    it('leaves the clearing unwritten when it fails midway, and the next call finishes it', async () => {
      await setOn(2026, 1, 10);
      await endedClass(noon(2026, 2, 1));
      await endedClass(noon(2026, 2, 2));
      ctx.clock.now = noon(2026, 7, 1);
      const failing = new ObservedStore(ctx.store, (nth) => {
        if (nth === 7) throw new Error('storage went away');
      });
      await expect(retentionOver(failing).clearIfDue()).rejects.toThrow('storage went away');
      expect((await settings())!.lastClearedAt).toBeNull();
      expect((await ctx.store.list('sessions')).length + (await ctx.store.list('answers')).length).toBeGreaterThan(0);

      expect(await ctx.retention.clearIfDue()).toBe(true);
      for (const collection of clearedCollections) expect(await ctx.store.list(collection)).toEqual([]);
      expect((await settings())!.lastClearedAt).toBe(noon(2026, 7, 1));
    });

    it('keeps a date set while a clearing is under way, and still records the clearing', async () => {
      await setOn(2026, 1, 10);
      await endedClass(noon(2026, 2, 1));
      ctx.clock.now = noon(2026, 7, 1);
      const interleaving = new ObservedStore(ctx.store, async (nth) => {
        if (nth !== 2) return;
        ctx.clock.now = noon(2026, 7, 1) + 1;
        await ctx.retention.setYearEnd({ month: 9, day: 1 });
      });
      expect(await retentionOver(interleaving).clearIfDue()).toBe(true);
      expect(await settings()).toEqual({ id: 'retention', yearEnd: { month: 9, day: 1 }, yearEndSetAt: noon(2026, 7, 1) + 1, lastClearedAt: noon(2026, 7, 1) });
    });

    it('runs once when asked twice at the same time', async () => {
      await setOn(2026, 1, 10);
      await endedClass(noon(2026, 2, 1));
      let total = 0;
      for (const collection of clearedCollections) total += (await ctx.store.list(collection)).length;
      ctx.clock.now = noon(2026, 7, 1);
      const counting = new ObservedStore(ctx.store);
      const service = retentionOver(counting);
      expect(await Promise.all([service.clearIfDue(), service.clearIfDue()])).toEqual([true, true]);
      expect(counting.removes).toBe(total);
      expect(await service.clearIfDue()).toBe(false);
    });

    it('creates the settings by choosing a date, and keeps the last clearing when it changes', async () => {
      await setOn(2026, 1, 10);
      ctx.clock.now = noon(2026, 7, 1);
      await ctx.retention.clearIfDue();
      ctx.clock.now = noon(2026, 8, 1);
      await ctx.retention.setYearEnd({ month: 8, day: 31 });
      expect(await settings()).toEqual({ id: 'retention', yearEnd: { month: 8, day: 31 }, yearEndSetAt: noon(2026, 8, 1), lastClearedAt: noon(2026, 7, 1) });
    });

    it('says when it ran, for the notice period', async () => {
      await setOn(2026, 1, 10);
      ctx.clock.now = noon(2026, 7, 1);
      await ctx.retention.clearIfDue();
      const notices: unknown[] = [];
      const stop = ctx.retention.watchNotices((notice) => notices.push(notice));
      await new Promise((resolve) => setTimeout(resolve, 0));
      ctx.clock.now = noon(2026, 7, 20);
      await ctx.retention.setYearEnd(june30);
      await new Promise((resolve) => setTimeout(resolve, 0));
      stop();
      expect(notices[0]).toEqual({ coming: null, done: day(noon(2026, 7, 1)) });
      expect(notices.at(-1)).toEqual({ coming: null, done: null });
    });

    it('does not run again until a year later', async () => {
      await setOn(2026, 1, 10);
      ctx.clock.now = noon(2026, 7, 1);
      expect(await ctx.retention.clearIfDue()).toBe(true);
      await ctx.store.put('classes', { id: 'c2', name: 'جديدة', order: 1 });
      ctx.clock.now = noon(2026, 12, 1);
      expect(await ctx.retention.clearIfDue()).toBe(false);
      ctx.clock.now = noon(2027, 6, 30);
      expect(await ctx.retention.clearIfDue()).toBe(false);
      expect(await ctx.store.list('classes')).toHaveLength(1);
      ctx.clock.now = noon(2027, 7, 1);
      expect(await ctx.retention.clearIfDue()).toBe(true);
      expect(await ctx.store.list('classes')).toEqual([]);
    });

    it('clears nothing now when the day set has already passed this year', async () => {
      await endedClass(noon(2026, 2, 1));
      await setOn(2026, 11, 13);
      expect(await ctx.retention.clearIfDue()).toBe(false);
      expect(await ctx.store.list('classes')).toHaveLength(1);
      ctx.clock.now = noon(2027, 7, 1);
      expect(await ctx.retention.clearIfDue()).toBe(true);
    });

    it('waits for next year when the date is set within a week of the day', async () => {
      await endedClass(noon(2026, 2, 1));
      await setOn(2026, 6, 28);
      ctx.clock.now = noon(2026, 7, 1);
      expect(await ctx.retention.clearIfDue()).toBe(false);
      expect(await ctx.store.list('classes')).toHaveLength(1);
      ctx.clock.now = noon(2027, 7, 1);
      expect(await ctx.retention.clearIfDue()).toBe(true);
    });
  });
});
