import { describe, expect, it } from 'vitest';
import type { Session } from '../domain/models';
import { ANSWER_CHANGES_PER_QUESTION, DEVICE_MISSES, PEER_HEARTS_PER_GIVER } from '../ports/limits';
import { argumentsFit, SURFACE_SHAPES } from '../services/surfaceShapes';
import { UI_SURFACE } from '../services/Services';
import { surfaceKind } from '../services/surfaceDispatch';
import { classroom, FAR, seatFor } from './classKit';
import { connect, type Client } from './hubHarness';

const LIMIT = (code: string) => ({ name: 'LimitError', code });

/** Looks a code up the way a page does and says what came back: the class, nothing, or the refusal. */
async function lookup(client: Client, id: number, code: string): Promise<Session | null | 'refused'> {
  await client.watch(id, 'classLookup', 'watchByCode', code);
  if (client.socket.refusal(id)) return 'refused';
  return (client.socket.values(id).at(-1) ?? null) as Session | null;
}

describe('guessing class codes', () => {
  it('locks only the device that guessed, after its twenty-first wrong code, and still serves a device with a seat, the admin, and another device at the same address, which also joins', async () => {
    const { harness, admin, session, students } = await classroom();
    const { phone: seated } = await seatFor(harness, admin, session.code, 'seated', students[0].id, students[0].groupId, '10.0.0.1');
    const guesser = connect(harness, 'guesser', null, '10.0.0.1');
    const outcomes: unknown[] = [];
    for (let guess = 0; guess < DEVICE_MISSES.max + 5; guess += 1) outcomes.push(await lookup(guesser, 100 + guess, `ZZ${String(guess).padStart(4, '0')}`));
    expect(outcomes.slice(0, DEVICE_MISSES.max)).toEqual(Array(DEVICE_MISSES.max).fill(null));
    expect(outcomes.slice(DEVICE_MISSES.max)).toEqual(Array(5).fill('refused'));
    expect(guesser.socket.refusal(100 + DEVICE_MISSES.max + 4)?.error).toEqual(LIMIT('lookups'));
    expect(await lookup(connect(harness, 'guesser', null, '10.0.0.1'), 1, session.code)).toBe('refused');
    const neighbour = connect(harness, 'neighbour', null, '10.0.0.1');
    expect((await lookup(neighbour, 1, session.code) as Session).code).toBe(session.code);
    expect(await neighbour.call(2, 'participants', 'join', session.code, students[1].groupId, students[1].id)).toMatchObject({ ok: true });
    expect((await lookup(seated, 1, session.code) as Session).code).toBe(session.code);
    expect((await lookup(connect(harness, 'laptop2', FAR, '10.0.0.1'), 1, session.code) as Session).code).toBe(session.code);
    expect((await lookup(connect(harness, 'elsewhere', null, '10.0.0.2'), 1, session.code) as Session).code).toBe(session.code);
    harness.clock.now += DEVICE_MISSES.lockMs;
    expect((await lookup(connect(harness, 'guesser', null, '10.0.0.1'), 1, session.code) as Session).code).toBe(session.code);
  });

  it('does not lock the school’s addresses at all: a hundred devices, each missing a few times, are all still served', async () => {
    const { harness, session } = await classroom();
    for (let device = 0; device < 100; device += 1) {
      const guesser = connect(harness, `g${device}`, null, '10.1.1.1');
      for (let guess = 0; guess < 5; guess += 1) await lookup(guesser, 10 + guess, `QQ${String(device).padStart(2, '0')}${guess}`);
    }
    expect((await lookup(connect(harness, 'fresh', null, '10.1.1.1'), 1, session.code) as Session).code).toBe(session.code);
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

  it('opens nothing for a device that only asked to join and was never let in, exactly like a stranger, and everything for one that was let in', async () => {
    const { harness, admin, session, students } = await classroom();
    const student = students[0];
    const waiting = connect(harness, 'waiting', null, '10.0.0.3');
    expect(await waiting.call(1, 'participants', 'join', session.code, student.groupId, student.id)).toMatchObject({ ok: true });
    const { phone: letIn } = await seatFor(harness, admin, session.code, 'let-in', students[1].id, students[1].groupId);
    await admin.call(5, 'sessions', 'end', session.id);
    expect(await lookup(waiting, 2, session.code)).toBeNull();
    await waiting.watch(3, 'sessionRoster', 'watchSeen', session.code);
    expect(waiting.socket.values(3)).toEqual([{ groups: [], students: [] }]);
    await waiting.watch(4, 'board', 'watchTotals', session.code);
    expect(waiting.socket.values(4)).toEqual([[]]);
    await waiting.watch(5, 'board', 'watchCardResults', session.code, student.cardNumber);
    expect(waiting.socket.values(5)).toEqual([null]);
    expect(((await lookup(letIn, 2, session.code)) as Session).status).toBe('ended');
    await letIn.watch(3, 'sessionRoster', 'watchSeen', session.code);
    expect((letIn.socket.values(3)[0] as { students: unknown[] }).students.length).toBeGreaterThan(0);
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
  it('are not rationed per socket (the old budget was 40 different cards): card numbers are public, so counting them protects nothing (docs/PLAN.md 2.8)', async () => {
    const { harness, session } = await classroom();
    const camera = connect(harness, 'camera');
    for (let card = 1; card <= 45; card += 1) {
      await camera.watch(card, 'board', 'watchCardResults', session.code, card);
      expect(camera.socket.refusal(card)).toBeUndefined();
    }
    expect(camera.socket.closedWith).toBeNull();
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
  it('lets a device ask for its standing only for the current week or month, never for a period of its own, so it cannot make the hub remember sums without end', () => {
    expect(argumentsFit('records', 'ownStandingIn', ['x:y', 'week'])).toBe(true);
    expect(argumentsFit('records', 'ownStandingIn', ['x:y', 'month'])).toBe(true);
    expect(argumentsFit('records', 'ownStandingIn', ['x:y', { kind: 'week', start: 0, end: 1 }])).toBe(false);
    expect(argumentsFit('records', 'ownStandingIn', ['x:y', 'year'])).toBe(false);
  });

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
