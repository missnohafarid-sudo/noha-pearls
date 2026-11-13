import { describe, expect, it } from 'vitest';
import type { Participant, Session } from '../domain/models';
import { ADDRESS_MISSES, ANSWER_CHANGES_PER_QUESTION, PEER_HEARTS_PER_GIVER, SOCKET_CARDS, WAITING_SEATS_PER_STUDENT } from '../ports/limits';
import { argumentsFit, SURFACE_SHAPES } from '../services/surfaceShapes';
import { UI_SURFACE } from '../services/Services';
import { surfaceKind } from '../services/surfaceDispatch';
import { connect, createHarness, type Client, type Harness } from './hubHarness';

const FAR = 9_000_000_000_000;
const LIMIT = (code: string) => ({ name: 'LimitError', code });

async function classroom() {
  const harness = createHarness();
  await harness.core.seed();
  const admin = connect(harness, 'laptop', FAR);
  const classId = (await harness.store.list('classes'))[0].id;
  const lessonId = (await harness.store.list('lessons'))[0].id;
  const teacherId = (await harness.store.list('teachers'))[0].id;
  await admin.call(1, 'sessions', 'start', lessonId, classId, teacherId);
  const session = (await harness.store.list('sessions'))[0] as Session;
  const students = await harness.store.list('students');
  return { harness, admin, session, students, lessonId };
}

/** Looks a code up the way a page does and says what came back: the class, nothing, or the refusal. */
async function lookup(client: Client, id: number, code: string): Promise<Session | null | 'refused'> {
  await client.watch(id, 'classLookup', 'watchByCode', code);
  if (client.socket.refusal(id)) return 'refused';
  return (client.socket.values(id).at(-1) ?? null) as Session | null;
}

async function seatFor(harness: Harness, admin: Client, code: string, device: string, studentId: string, groupId: string, address = 'local'): Promise<{ phone: Client; seat: Participant }> {
  const phone = connect(harness, device, null, address);
  expect(await phone.call(1, 'participants', 'join', code, groupId, studentId)).toMatchObject({ ok: true });
  const seat = (await harness.store.list('participants')).find((candidate) => candidate.id.endsWith(`:${device}`)) as Participant;
  await admin.call(2000 + Math.floor(Math.random() * 100000), 'admission', 'admit', seat.id, studentId);
  return { phone, seat };
}

describe('guessing class codes', () => {
  it('locks the address after its misses, still serves a device that has a seat and the admin there, and leaves other addresses alone', async () => {
    const { harness, admin, session, students } = await classroom();
    const { phone: seated } = await seatFor(harness, admin, session.code, 'seated', students[0].id, students[0].groupId, '10.0.0.1');
    const guesser = connect(harness, 'guesser', null, '10.0.0.1');
    const outcomes: unknown[] = [];
    for (let guess = 0; guess < ADDRESS_MISSES.max + 5; guess += 1) outcomes.push(await lookup(guesser, 100 + guess, `ZZ${String(guess).padStart(4, '0')}`));
    expect(outcomes.slice(0, ADDRESS_MISSES.max)).toEqual(Array(ADDRESS_MISSES.max).fill(null));
    expect(outcomes.at(-1)).toBe('refused');
    expect(guesser.socket.refusal(100 + ADDRESS_MISSES.max + 4)?.error).toEqual(LIMIT('lookups'));
    expect(await lookup(connect(harness, 'late', null, '10.0.0.1'), 1, session.code)).toBe('refused');
    expect((await lookup(seated, 1, session.code) as Session).code).toBe(session.code);
    expect((await lookup(connect(harness, 'laptop2', FAR, '10.0.0.1'), 1, session.code) as Session).code).toBe(session.code);
    expect((await lookup(connect(harness, 'elsewhere', null, '10.0.0.2'), 1, session.code) as Session).code).toBe(session.code);
    harness.clock.now += 11 * 60_000;
    expect((await lookup(connect(harness, 'later', null, '10.0.0.1'), 1, session.code) as Session).code).toBe(session.code);
  });

  it('closes lookups for visitors school-wide after 3,000 wrong codes in an hour, not for a seated device or the admin', async () => {
    const { harness, admin, session, students } = await classroom();
    const { phone: seated } = await seatFor(harness, admin, session.code, 'seated', students[0].id, students[0].groupId, '10.9.9.9');
    for (let address = 0; address < 151; address += 1) {
      const guesser = connect(harness, `g${address}`, null, `10.1.${address}.1`);
      for (let guess = 0; guess < 20; guess += 1) await lookup(guesser, 10 + guess, `QQ${String(address).padStart(2, '0')}${String(guess).padStart(2, '0')}`);
    }
    expect(await lookup(connect(harness, 'fresh', null, '10.7.7.7'), 1, session.code)).toBe('refused');
    expect((await lookup(seated, 2, session.code) as Session).code).toBe(session.code);
    expect((await lookup(admin, 3, session.code) as Session).code).toBe(session.code);
  });
});

describe('an ended class', () => {
  it('has a code that is unknown to a visitor, like a wrong code, and works for the device that held a seat and for the admin', async () => {
    const { harness, admin, session, students } = await classroom();
    const student = students[0];
    const { phone } = await seatFor(harness, admin, session.code, 'mine', student.id, student.groupId);
    await admin.call(5, 'sessions', 'end', session.id);
    const stranger = connect(harness, 'stranger');
    expect(await lookup(stranger, 1, session.code)).toBeNull();
    expect(await lookup(stranger, 2, 'WRONG1')).toBeNull();
    await stranger.watch(3, 'sessionRoster', 'watchSeen', session.code);
    expect(stranger.socket.values(3)).toEqual([{ groups: [], students: [] }]);
    await stranger.watch(4, 'board', 'watchTotals', session.code);
    expect(stranger.socket.values(4)).toEqual([[]]);
    expect(((await lookup(phone, 1, session.code)) as Session).status).toBe('ended');
    await phone.watch(3, 'sessionRoster', 'watchSeen', session.code);
    expect((phone.socket.values(3)[0] as { students: unknown[] }).students.length).toBeGreaterThan(0);
    expect(((await lookup(admin, 1, session.code)) as Session).status).toBe('ended');
  });

  it('is not reachable by its internal id on any public read or join', async () => {
    const { harness, admin, session, students } = await classroom();
    await admin.call(5, 'sessions', 'end', session.id);
    const stranger = connect(harness, 'stranger');
    await stranger.watch(1, 'sessionRoster', 'watchSeen', session.id);
    await stranger.watch(2, 'board', 'watchTotals', session.id);
    await stranger.watch(3, 'board', 'watchCardResults', session.id, 1);
    await stranger.watch(4, 'participants', 'watchNameClaims', session.id);
    await stranger.watch(5, 'rewards', 'watchHeartCount', session.id);
    expect(stranger.socket.values(1)).toEqual([{ groups: [], students: [] }]);
    expect(stranger.socket.values(2)).toEqual([[]]);
    expect(stranger.socket.values(3)).toEqual([null]);
    expect(stranger.socket.values(5)).toEqual([0]);
    const records = await stranger.call(6, 'records', 'groupStandingsOf', session.id, 'week');
    expect(records).toMatchObject({ ok: true, value: [] });
    expect((await harness.store.list('participants')).length).toBe(0);
    expect(students.length).toBeGreaterThan(0);
  });
});

describe('card results', () => {
  it('allow only so many different card numbers per socket, and a card already asked for again at no cost', async () => {
    const { harness, session } = await classroom();
    const camera = connect(harness, 'camera');
    for (let card = 1; card <= SOCKET_CARDS.max; card += 1) {
      await camera.watch(card, 'board', 'watchCardResults', session.code, card);
      expect(camera.socket.refusal(card)).toBeUndefined();
    }
    await camera.watch(500, 'board', 'watchCardResults', session.code, SOCKET_CARDS.max + 1);
    expect(camera.socket.refusal(500)?.error).toEqual(LIMIT('cards'));
    await camera.watch(501, 'board', 'watchCardResults', session.code, 1);
    expect(camera.socket.refusal(501)).toBeUndefined();
    await connect(harness, 'other').watch(1, 'board', 'watchCardResults', session.code, 999);
  });
});

describe('asking for seats', () => {
  it('stops at two waiting devices for one name, and a device asking again replaces its own seat', async () => {
    const { harness, session, students } = await classroom();
    const student = students[0];
    const join = (device: string) => connect(harness, device, null, '10.4.0.1').call(1, 'participants', 'join', session.code, student.groupId, student.id);
    for (let n = 0; n < WAITING_SEATS_PER_STUDENT; n += 1) expect(await join(`d${n}`)).toMatchObject({ ok: true });
    const third = await join('d9');
    expect(third).toMatchObject({ ok: false, error: LIMIT('seats-full') });
    expect(await join('d0')).toMatchObject({ ok: true });
    expect((await harness.store.list('participants')).length).toBe(2);
  });

  it('stops at ten waiting shared devices in a class', async () => {
    const { harness, session, students } = await classroom();
    const outcomes: boolean[] = [];
    for (let n = 0; n < 11; n += 1) outcomes.push((await connect(harness, `s${n}`, null, `10.5.0.${n}`).call(1, 'participants', 'join', session.code, students[0].groupId, null)).ok);
    expect(outcomes).toEqual([...Array(10).fill(true), false]);
  });

  it('stops a device that asks more than ten times in a minute', async () => {
    const { harness, session, students } = await classroom();
    const phone = connect(harness, 'eager', null, '10.6.0.1');
    const results = [];
    for (let n = 0; n < 12; n += 1) results.push(await phone.call(n + 1, 'participants', 'join', session.code, students[0].groupId, students[0].id));
    expect(results.slice(0, 10).every((result) => result.ok)).toBe(true);
    expect(results[10]).toMatchObject({ ok: false, error: LIMIT('joins') });
  });
});

describe('hearts and answers from a student', () => {
  it('lets a student give ten hearts in a class and refuses the eleventh', async () => {
    const { harness, admin, session, students } = await classroom();
    const giver = students[0];
    const other = students.find((student) => student.groupId !== giver.groupId)!;
    const { phone } = await seatFor(harness, admin, session.code, 'giver', giver.id, giver.groupId);
    for (let n = 0; n < PEER_HEARTS_PER_GIVER; n += 1) expect(await phone.call(10 + n, 'rewards', 'giveAsPeer', session.id, other.id)).toMatchObject({ ok: true, value: true });
    expect(await phone.call(99, 'rewards', 'giveAsPeer', session.id, other.id)).toMatchObject({ ok: false, error: LIMIT('hearts-used') });
    expect(await admin.call(100, 'rewards', 'giveAsTeacher', session.id, { kind: 'student', id: other.id })).toMatchObject({ ok: true, value: true });
    expect((await harness.store.list('rewards')).length).toBe(PEER_HEARTS_PER_GIVER + 1);
  });

  it('writes and announces nothing when the same answer is sent again, and allows only 30 changes', async () => {
    const { harness, admin, session, students } = await classroom();
    const student = students[0];
    const { phone } = await seatFor(harness, admin, session.code, 'answerer', student.id, student.groupId);
    const lesson = (await harness.store.list('lessons'))[0];
    const slide = lesson.slides.find((candidate) => candidate.kind === 'choice' && candidate.scope === 'individual')!;
    await admin.call(3, 'sessions', 'goTo', session.id, lesson.slides.indexOf(slide));
    await admin.watch(7, 'answers', 'watchAnswers', session.id);
    expect(await phone.call(20, 'answers', 'submitFromDevice', session.id, slide.id, 0)).toMatchObject({ ok: true, value: true });
    const announced = admin.socket.values(7).length;
    harness.sql.reset();
    expect(await phone.call(21, 'answers', 'submitFromDevice', session.id, slide.id, 0)).toMatchObject({ ok: true, value: true });
    expect(harness.sql.rowsWritten).toBe(0);
    expect(admin.socket.values(7)).toHaveLength(announced);
    for (let n = 0; n < ANSWER_CHANGES_PER_QUESTION; n += 1) {
      expect(await phone.call(30 + n, 'answers', 'submitFromDevice', session.id, slide.id, (n + 1) % 2)).toMatchObject({ ok: true, value: true });
    }
    const stored = (await harness.store.list('answers'))[0];
    const last = stored.value;
    expect(await phone.call(80, 'answers', 'submitFromDevice', session.id, slide.id, last === 0 ? 1 : 0)).toMatchObject({ ok: false, error: LIMIT('answer-changes') });
    expect(await phone.call(81, 'answers', 'submitFromDevice', session.id, slide.id, last)).toMatchObject({ ok: true, value: true });
    expect((await harness.store.list('answers'))[0].value).toBe(last);
  });
});

describe('arguments that do not fit', () => {
  it('has a shape for every method of the surface and for none that is not on it', () => {
    const shaped = Object.entries(SURFACE_SHAPES).flatMap(([service, methods]) => Object.keys(methods).map((method) => `${service}.${method}`));
    const surface = Object.entries(UI_SURFACE).flatMap(([service, names]) => (names as readonly string[]).map((name) => `${service}.${name}`));
    expect(shaped.sort()).toEqual(surface.sort());
  });

  it('are refused by every method, for the admin too, and leave the store as it was', async () => {
    const { harness, admin, session } = await classroom();
    const visitor = connect(harness, 'visitor');
    const everything = async () => JSON.stringify(await Promise.all(['site', 'classes', 'teachers', 'groups', 'students', 'folders', 'lessons', 'sessions', 'rosters', 'participants', 'answers', 'rewards', 'records', 'retention'].map((name) => harness.store.list(name as 'site'))));
    const before = await everything();
    const junk: unknown[] = [12345, null, {}, [], 'x'.repeat(5000), -1, 1.5, true, { kind: 'student', id: 5 }, session.id + '\u0000'.repeat(100), 'x'.repeat(40_000)];
    let id = 1000;
    for (const [service, methods] of Object.entries(SURFACE_SHAPES)) {
      for (const [method, shapes] of Object.entries(methods as Record<string, readonly unknown[]>)) {
        if (surfaceKind(service, method) === null) continue;
        const isWatch = method.startsWith('watch');
        for (const value of shapes.length === 0 ? [...junk] : [...junk, undefined]) {
          for (const client of [admin, visitor]) {
            if (client === visitor && typeof value === 'string' && value.length > 10_000) continue;
            const args = value === undefined ? [] : Array(shapes.length === 0 ? 1 : shapes.length).fill(value);
            if (argumentsFit(service, method, args)) continue;
            id += 1;
            harness.clock.now += 1000;
            if (isWatch) {
              await client.watch(id, service, method, ...args);
              expect(client.socket.refusal(id), `${service}.${method} ${JSON.stringify(value)?.slice(0, 20)}`).toBeDefined();
            } else {
              const result = await client.call(id, service, method, ...args);
              expect(result.ok, `${service}.${method} ${JSON.stringify(value)?.slice(0, 20)}`).toBe(false);
            }
          }
        }
      }
    }
    expect(await everything()).toBe(before);
    expect(harness.reported).toEqual([]);
  });
});
