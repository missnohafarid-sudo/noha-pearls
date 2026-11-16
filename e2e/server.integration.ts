import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClassRoster, Lesson, LessonSummary, Participant, Session, Teacher } from '../src/domain/models';
import { LOCAL_ADMIN_SECRETS } from '../vite.config';
import { Device, LiveSocket, rightCode, rightPassword, wrongCode } from './hubClient';
import { build, BUILT_WRANGLER_CONFIG, start, STARTUP_MS, stopEverything, type Server } from './serverProcess';
import { MAX_POST_BODY_BYTES } from '../src/ports/limits';
import { STATUS_HUB_MOVED } from '../src/ports/wire';
import { FORMER_HUB_PATH, INSTANCE_PATH } from '../src/server/testing/probePaths';
import { SAMPLE } from './sample';

/** The real local server, driven the way pages drive it: plain requests and one socket per page, each device with its own cookies. */

const stateDir = mkdtempSync(join(tmpdir(), 'noha-pearls-hub-'));
/** A hibernatable hub forgets its memory after about ten idle seconds (docs/PLAN.md 2.4). */
const IDLE_UNTIL_EVICTED_MS = 15_000;
const PROBE_CONFIG = 'e2e/probe/wrangler.jsonc';
const BUILT_PAGE = 'dist/client';
const BUILT_FILES = [BUILT_PAGE, 'dist/noha_pearls'];

function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** Values no real secret has: a build that finds them anywhere in its output carried a build variable into the page or the Worker. */
const CANARIES = { VITE_ADMIN_PASSWORD_SHA256: 'canary-password-hash-7f3a91c2', VITE_ADMIN_TOTP_SECRET: 'CANARYTOTPSECRET7F3A91C2' };

const builtTextFiles = (): string[] => BUILT_FILES.flatMap(filesUnder).filter((path) => !/\.(png|jpe?g|woff2?|ico|webp)$/.test(path));

describe('a build made with secrets in its environment', () => {
  beforeAll(() => build({ ...CANARIES, NOHA_SITE_ONLY: 'true' }), STARTUP_MS * 2);

  it('holds neither secret anywhere, and is still the hub build: only exactly 1 turns the browser-only mode on', () => {
    for (const file of builtTextFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const canary of Object.values(CANARIES)) expect(text.includes(canary), `${file} holds ${canary}`).toBe(false);
    }
    expect(readdirSync('dist/noha_pearls')).toContain('wrangler.json');
    const page = filesUnder(BUILT_PAGE).filter((path) => path.endsWith('.js')).map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(page).not.toContain('pearls/admin');
  });
});

describe('what a deploy would use', () => {
  beforeAll(() => build(), STARTUP_MS * 2);

  it('holds neither development sign-in value, no variable and no local-only switch, in the configuration or anywhere in the build', () => {
    const configuration = readFileSync(BUILT_WRANGLER_CONFIG, 'utf8');
    expect(configuration).not.toMatch(/ADMIN_PASSWORD|ADMIN_TOTP_SECRET|SAMPLE_SCHOOL|NOHA_SITE_ONLY|CLOUDFLARE_ENV/);
    expect((JSON.parse(configuration) as { vars?: object }).vars ?? {}).toEqual({});
    const forbidden = [...Object.values(LOCAL_ADMIN_SECRETS), 'NOHA_SITE_ONLY'];
    for (const file of builtTextFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const value of forbidden) expect(text.includes(value), `${file} holds ${value}`).toBe(false);
    }
  });

  it('puts neither the browser store nor the prototype sign-in into the page', () => {
    const page = filesUnder(BUILT_PAGE).filter((path) => path.endsWith('.js')).map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(page).not.toContain('pearls/admin');
    expect(page).not.toContain('VITE_ADMIN');
  });
});

describe('the local server', () => {
  let server: Server;
  const device = (address?: string) => new Device(() => server.origin, address);
  /** A visitor's page: it says hello, which gives the device its cookie, then opens its socket. */
  const visitorSocket = async (): Promise<LiveSocket> => {
    const visitor = device();
    await visitor.hello();
    return visitor.open();
  };

  /** A device that has said hello and is signed in as the teacher. */
  async function teacher(address = '10.1.1.1'): Promise<Device> {
    const signedIn = device(address);
    await signedIn.hello();
    expect(await signedIn.signIn(rightPassword(), await rightCode())).toBe(true);
    return signedIn;
  }

  beforeAll(async () => {
    server = await start(stateDir, { withSecrets: true });
  }, STARTUP_MS * 2);

  afterAll(async () => {
    await stopEverything();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('serves the site, and a health check that writes nothing', async () => {
    const page = await fetch(`${server.origin}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    expect(await (await fetch(`${server.origin}/api/health`)).json()).toEqual({ ok: true });
  });

  it('answers what the Worker can alone: a health check that reads, and a 404 for any /api path the hub does not serve', async () => {
    expect((await fetch(`${server.origin}/api/health`, { method: 'POST' })).status).toBe(405);
    for (const path of ['/api/nothing', '/api/live/extra', '/api/', '/api/hello/x']) expect((await fetch(`${server.origin}${path}`)).status, path).toBe(404);
    expect((await fetch(`${server.origin}/api/hello`)).status).toBe(404);
  });

  it('puts nosniff and no-store on every answer under /api/, whether the Worker or the hub gives it, errors and not-founds included', async () => {
    const asked: [string, string, BodyInit?][] = [
      ['GET', '/api/health'], ['POST', '/api/health'], ['GET', '/api/nothing'], ['GET', '/api/hello'], ['POST', '/api/hello'],
      ['POST', '/api/sign-in', 'not json'], ['POST', '/api/sign-in', 'x'.repeat(MAX_POST_BODY_BYTES + 1)], ['POST', '/api/sign-out'], ['GET', '/api/live'],
    ];
    for (const [method, path, body] of asked) {
      const reply = await fetch(`${server.origin}${path}`, { method, body });
      expect(reply.headers.get('X-Content-Type-Options'), `${method} ${path}`).toBe('nosniff');
      expect(reply.headers.get('Cache-Control'), `${method} ${path}`).toBe('no-store');
    }
  });

  describe('a plain request whose body is not small and honestly measured', () => {
    const post = (body: BodyInit) => fetch(`${server.origin}/api/sign-in`, { method: 'POST', body });
    const stillHealthy = async () => expect(await (await fetch(`${server.origin}/api/health`)).json()).toEqual({ ok: true });

    it('is refused with 413 when it is just over the limit and fully written before the reply', async () => {
      expect((await post('x'.repeat(MAX_POST_BODY_BYTES + 1))).status).toBe(413);
      await stillHealthy();
    });

    it('is refused with 413 on the length it declares, before any of it is sent', async () => {
      const reply = await new Promise<string>((resolve, reject) => {
        const socket = connect(Number(new URL(server.origin).port), new URL(server.origin).hostname);
        let text = '';
        socket.on('data', (chunk) => { text += chunk.toString(); if (text.includes('\r\n')) socket.destroy(); });
        socket.on('close', () => resolve(text));
        socket.on('error', reject);
        socket.write('POST /api/sign-in HTTP/1.1\r\nHost: local\r\nContent-Length: 5000000\r\n\r\nx');
      });
      expect(reply.split('\r\n')[0]).toBe('HTTP/1.1 413 Payload Too Large');
      await stillHealthy();
    });

    it('is refused with 411 when it names no length', async () => {
      const unmeasured = new ReadableStream({ start: (controller) => { controller.enqueue(new TextEncoder().encode('{}')); controller.close(); } });
      expect((await fetch(`${server.origin}/api/sign-in`, { method: 'POST', body: unmeasured, duplex: 'half' } as RequestInit)).status).toBe(411);
    });

    it('is refused when it is 5 MB: the reply is 413, or the local development proxy loses the upload it was still forwarding, and the hub is still answering at once', async () => {
      // The Worker answers 413 without reading the body. `wrangler dev` forwards the upload through its own proxy, which then
      // drops the connection: Node's fetch reports the cut-off send as an error instead of the reply it had already received, or
      // the proxy itself answers 500 "Network connection lost". In every case the hub got no more than it needed to refuse it.
      const outcome = await post('x'.repeat(5_000_000)).then(
        async (response) => (response.status === 500 && (await response.text()).includes('Network connection lost') ? 'proxy-lost-upload' : response.status),
        (failure: { cause?: { code?: string } }) => failure.cause?.code,
      );
      expect([413, 'proxy-lost-upload', 'EPIPE', 'ECONNRESET', 'UND_ERR_SOCKET']).toContain(outcome);
      await stillHealthy();
    });
  });

  describe('a signed-out visitor', () => {
    it('is told she is not the admin, and is refused teacher commands, teacher reads and names off the table', async () => {
      const visitor = device();
      expect(await visitor.hello()).toMatchObject({ admin: false });
      expect(visitor.cookieNamed('noha_device')).toBeDefined();
      const live = await visitor.open();
      expect(live.hello()).toMatchObject({ admin: false });
      expect(await live.call('teachers', 'add', 'Intruder')).toMatchObject({ ok: false, error: { name: 'NotAuthorizedError' } });
      const read = live.watch('roster', 'watchClasses');
      await live.until(() => live.refusalOf(read) !== undefined);
      expect(live.refusalOf(read)?.error.name).toBe('NotAuthorizedError');
      expect(await live.call('retention', 'clearIfDue')).toMatchObject({ ok: false, error: { name: 'SurfaceError' } });
      expect(await live.call('teachers', 'watchTeachers')).toMatchObject({ ok: false, error: { name: 'SurfaceError' } });
      expect((await live.firstValue<Teacher[]>('teachers', 'watchTeachers')).length).toBeGreaterThan(0);
      live.close();
    });

    it('cannot open a socket without the cookie the hub gave her device, nor from another origin, nor from the origin called null', async () => {
      await expect(LiveSocket.open(server.origin, '')).rejects.toThrow();
      const response = await fetch(`${server.origin}/api/hello`, { method: 'POST', headers: { Origin: 'http://evil.example' } });
      expect(response.status).toBe(403);
      const visitor = device();
      await visitor.hello();
      for (const origin of ['http://evil.example', 'null', 'https://noha-pearls.example']) {
        await expect(LiveSocket.open(server.origin, visitor.cookie, { Origin: origin }), origin).rejects.toThrow();
      }
      (await LiveSocket.open(server.origin, visitor.cookie, { Origin: server.origin })).close();
      (await visitor.open()).close();
    });

    it('has its socket closed when it sends bytes instead of text, or more than 64,000 characters', async () => {
      const [binary, long, fine] = await Promise.all([visitorSocket(), visitorSocket(), visitorSocket()]);
      binary.sendRaw(new Uint8Array([1, 2, 3]).buffer);
      long.sendRaw(JSON.stringify({ type: 'call', id: 1, service: 'teachers', method: 'add', args: ['x'.repeat(70_000)] }));
      fine.sendRaw('not json at all');
      await binary.until(() => binary.closedWith !== null);
      await long.until(() => long.closedWith !== null);
      expect(binary.closedWith?.code).toBe(1008);
      expect(long.closedWith?.code).toBe(1008);
      expect(await fine.call('teachers', 'add', 'Intruder')).toMatchObject({ ok: false, error: { name: 'NotAuthorizedError' } });
      expect(fine.closedWith).toBeNull();
      fine.close();
    });
  });

  describe('a page that sends too fast', () => {
    const address = '10.12.12.12';
    /** A page of this device that opens its socket and sends more than the hub allows at once; how the hub closed it. */
    async function flood(visitor: Device): Promise<number | undefined> {
      const live = await visitor.open();
      for (let id = 0; id < 130; id += 1) live.sendRaw(JSON.stringify({ type: 'unwatch', id }));
      await live.until(() => live.closedWith !== null);
      return live.closedWith?.code;
    }

    it('has its socket closed, and the third such socket locks that device: no hello, no socket, until the lock ends; another device at the same address, the teacher on it and other addresses are not turned away', async () => {
      const signedIn = await teacher(address);
      const flooder = device(address);
      await flooder.hello();
      expect([await flood(flooder), await flood(flooder), await flood(flooder)]).toEqual([4008, 4008, 4009]);
      const refused = await flooder.post('/api/hello');
      expect(refused.status).toBe(429);
      expect(refused.text).toBe('');
      await expect(flooder.open()).rejects.toThrow();
      const neighbour = device(address);
      expect((await neighbour.post('/api/hello')).status).toBe(200);
      const neighbourLive = await neighbour.open();
      expect(neighbourLive.hello()).toMatchObject({ admin: false });
      neighbourLive.close();
      expect((await device('10.12.12.13').post('/api/hello')).status).toBe(200);
      expect(await signedIn.hello()).toMatchObject({ admin: true });
      const live = await signedIn.open();
      expect(live.hello()).toMatchObject({ admin: true });
      live.close();
    });

    it('never counts the teacher’s messages: 300 at once keep her socket open and her device unlocked', async () => {
      const signedIn = await teacher('10.12.12.20');
      const live = await signedIn.open();
      for (let id = 0; id < 300; id += 1) live.sendRaw(JSON.stringify({ type: 'unwatch', id }));
      expect(await live.call('teachers', 'add', 'Huda')).toMatchObject({ ok: true });
      expect(live.closedWith).toBeNull();
      live.close();
      expect(await signedIn.hello()).toMatchObject({ admin: true });
    });
  });

  describe('signing in', () => {
    it('answers the same no to a wrong password and to a wrong code, and yes to the right pair, which sets a week-long cookie', async () => {
      const first = device('10.2.2.2');
      await first.hello();
      const a = await first.post('/api/sign-in', { password: 'not-the-password', code: await rightCode() });
      const b = await first.post('/api/sign-in', { password: rightPassword(), code: await wrongCode() });
      expect(a.text).toBe(b.text);
      expect(JSON.parse(a.text)).toEqual({ ok: false });
      expect(a.setCookies.some((line) => line.startsWith('noha_admin='))).toBe(false);
      const yes = await first.post('/api/sign-in', { password: rightPassword(), code: await rightCode() });
      expect(JSON.parse(yes.text)).toEqual({ ok: true });
      const cookie = yes.setCookies.find((line) => line.startsWith('noha_admin='));
      expect(cookie).toMatch(/Max-Age=604800/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(await first.hello()).toMatchObject({ admin: true });
    });

    it('accepts the same code for a second device at once', async () => {
      const code = await rightCode();
      const [one, two] = [device('10.3.3.1'), device('10.3.3.2')];
      await Promise.all([one.hello(), two.hello()]);
      expect(await Promise.all([one.signIn(rightPassword(), code), two.signIn(rightPassword(), code)])).toEqual([true, true]);
    });

    it('locks an address after five wrong attempts, even for the right pair, and leaves other addresses alone', async () => {
      const locked = device('10.4.4.4');
      await locked.hello();
      for (let n = 0; n < 5; n += 1) expect(await locked.signIn('wrong-password-1', await rightCode())).toBe(false);
      expect(await locked.signIn(rightPassword(), await rightCode())).toBe(false);
      const other = device('10.4.4.5');
      await other.hello();
      expect(await other.signIn(rightPassword(), await rightCode())).toBe(true);
    });
  });

  describe('the teacher', () => {
    it('runs a command and another page watching the public list gets the new value without asking again', async () => {
      const watcher = await visitorSocket();
      const id = watcher.watch('teachers', 'watchTeachers');
      await watcher.until(() => watcher.valuesOf(id).length === 1);
      const signedIn = await teacher();
      const live = await signedIn.open();
      expect(live.hello()).toMatchObject({ admin: true });
      expect(await live.call('teachers', 'add', 'Huda')).toMatchObject({ ok: true });
      await watcher.until(() => (watcher.valuesOf(id).at(-1) as Teacher[]).some((entry) => entry.name === 'Huda'));
      live.close();
      watcher.close();
    });

    it('has every socket of the device closed when she signs out, and a socket opened afterwards is a visitor’s', async () => {
      const signedIn = await teacher('10.5.5.6');
      const [first, second] = [await signedIn.open(), await signedIn.open()];
      const bystander = await (await teacher('10.5.5.7')).open();
      await signedIn.signOut();
      await first.until(() => first.closeReceived);
      await second.until(() => second.closeReceived);
      expect(bystander.closeReceived).toBe(false);
      const reopened = await signedIn.open();
      expect(reopened.hello()).toMatchObject({ admin: false });
      expect(await reopened.call('teachers', 'add', 'Refused')).toMatchObject({ ok: false, error: { name: 'NotAuthorizedError' } });
      [reopened, bystander].forEach((live) => live.close());
    });

    it('is refused teacher commands after signing out, on a new socket', async () => {
      const signedIn = await teacher('10.5.5.5');
      expect(await (await signedIn.open()).call('teachers', 'add', 'Allowed')).toMatchObject({ ok: true });
      await signedIn.signOut();
      expect(await signedIn.hello()).toMatchObject({ admin: false });
      const after = await signedIn.open();
      expect(await after.call('teachers', 'add', 'Refused')).toMatchObject({ ok: false, error: { name: 'NotAuthorizedError' } });
      after.close();
    });
  });

  describe('a class', () => {
    interface Class { sessionId: string; session: Session; groupId: string; studentId: string; slideId: string; slideIndex: number; admin: LiveSocket; adminDevice: Device }

    async function startClass(): Promise<Class> {
      const adminDevice = await teacher('10.6.6.6');
      const admin = await adminDevice.open();
      const [lessons, classes, teachers] = await Promise.all([
        admin.firstValue<LessonSummary[]>('lessons', 'watchLessons'),
        admin.firstValue<{ id: string }[]>('roster', 'watchClasses'),
        admin.firstValue<Teacher[]>('teachers', 'watchTeachers'),
      ]);
      const outcome = await admin.call('sessions', 'start', lessons[0].id, classes[0].id, teachers[0].id);
      const session = (outcome as { value: Session }).value;
      const roster = await admin.firstValue<ClassRoster>('roster', 'watchRoster', classes[0].id);
      const lesson = await admin.firstValue<Lesson>('lessons', 'watchLesson', lessons[0].id);
      const slideIndex = lesson.slides.findIndex((slide) => slide.kind === 'choice' && slide.scope === 'individual' && slide.explanation !== '');
      await admin.call('sessions', 'goTo', session.id, slideIndex);
      return { sessionId: session.id, session, groupId: roster.students[0].groupId, studentId: roster.students[0].id, slideId: lesson.slides[slideIndex].id, slideIndex, admin, adminDevice };
    }

    it('lets two devices ask for one name at the same instant, admits exactly one, and keeps the answer key from everyone who is not the teacher', async () => {
      const cls = await startClass();
      const [phoneA, phoneB, visitor] = [device(), device(), device()];
      await Promise.all([phoneA.hello(), phoneB.hello(), visitor.hello()]);
      const [liveA, liveB, liveV] = await Promise.all([phoneA.open(), phoneB.open(), visitor.open()]);
      const { sessionId, groupId, studentId } = cls;

      const watchAll = (live: LiveSocket) => {
        live.watch('lessons', 'watchLessons');
        live.watch('lessons', 'watchLesson', cls.session.lessonId);
        live.watch('classLookup', 'watchByCode', cls.session.code);
        live.watch('classLookup', 'watchAnyLive');
        live.watch('sessionRoster', 'watchSeen', cls.session.code);
        live.watch('participants', 'watchMine', sessionId);
        live.watch('participants', 'watchNameClaims', cls.session.code);
        live.watch('seatView', 'watchMine', sessionId);
        live.watch('seatView', 'watchLesson', sessionId);
        live.watch('board', 'watchTotals', cls.session.code);
        live.watch('board', 'watchCardResults', cls.session.code, 1);
        live.watch('rewards', 'watchHeartCount', cls.session.code);
      };
      [liveA, liveB, liveV].forEach(watchAll);

      const joined = await Promise.all([liveA.call('participants', 'join', cls.session.code, groupId, studentId), liveB.call('participants', 'join', cls.session.code, groupId, studentId)]);
      expect(joined.every((outcome) => outcome.ok && outcome.value !== null)).toBe(true);

      const seats = await cls.admin.firstValue<Participant[]>('participants', 'watchParticipants', sessionId);
      expect(seats).toHaveLength(2);
      expect(new Set(seats.map((seat) => seat.id)).size).toBe(2);
      await cls.admin.call('admission', 'admitAll', sessionId);
      expect((await cls.admin.firstValue<Participant[]>('participants', 'watchParticipants', sessionId)).filter((seat) => seat.admitted)).toHaveLength(0);
      await cls.admin.call('admission', 'admit', seats[0].id, studentId);
      const stored = await cls.admin.firstValue<Participant[]>('participants', 'watchParticipants', sessionId);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ id: seats[0].id, admitted: true, studentId });

      const answers = cls.admin.watch('answers', 'watchAnswers', sessionId);
      await cls.admin.until(() => cls.admin.valuesOf(answers).length > 0);
      const phones = [liveA, liveB];
      const accepted = await Promise.all(phones.map((live) => live.call('answers', 'submitFromDevice', sessionId, cls.slideId, 0)));
      expect(accepted.filter((outcome) => outcome.ok && outcome.value === true)).toHaveLength(1);
      await cls.admin.until(() => (cls.admin.valuesOf(answers).at(-1) as unknown[]).length === 1);

      for (const live of [liveA, liveB, liveV]) {
        await live.until(() => live.raw.length > 0);
        expect(live.raw, 'a right answer reached a student or visitor').not.toMatch(/"correctIndex":\s*\d/);
        expect(live.raw, 'an explanation reached a student or visitor').not.toMatch(/"explanation":\s*"[^"]/);
        for (const explanation of SAMPLE.slides.flatMap((slide) => ('explanation' in slide && slide.explanation ? [String(slide.explanation)] : []))) {
          expect(live.raw.includes(explanation), 'an explanation reached a student or visitor').toBe(false);
        }
      }
      expect(liveV.raw).not.toContain('cardNumber');
      expect(cls.admin.raw, 'the teacher does receive the key, so the scan above can see one').toMatch(/"correctIndex":\s*\d/);
      [liveA, liveB, liveV, cls.admin].forEach((live) => live.close());
    });

    it('locks the lookups of a device that guesses wrong codes, keeps a seated device and the teacher working, and shows an ended class only to a device that was let in', async () => {
      const cls = await startClass();
      const holder = device('10.31.0.1');
      await holder.hello();
      const holderLive = await holder.open();
      expect(await holderLive.call('participants', 'join', cls.session.code, cls.groupId, cls.studentId)).toMatchObject({ ok: true });
      const [heldSeat] = await cls.admin.firstValue<Participant[]>('participants', 'watchParticipants', cls.sessionId);
      await cls.admin.call('admission', 'admit', heldSeat.id, cls.studentId);
      const asker = device('10.31.0.1');
      await asker.hello();
      const askerLive = await asker.open();
      expect(await askerLive.call('participants', 'join', cls.session.code, cls.groupId, null)).toMatchObject({ ok: true });
      const guesser = device('10.31.0.1');
      await guesser.hello();
      const guesserLive = await guesser.open();
      const refused = (live: LiveSocket, id: number) => live.refusalOf(id)?.error.name === 'LimitError';
      const ids: number[] = [];
      for (let guess = 0; guess < 25; guess += 1) {
        ids.push(guesserLive.watch('classLookup', 'watchByCode', `ZZ${String(guess).padStart(4, '0')}`));
        await guesserLive.until(() => guesserLive.valuesOf(ids[guess]).length > 0 || guesserLive.refusalOf(ids[guess]) !== undefined);
      }
      expect(ids.slice(0, 20).some((id) => refused(guesserLive, id))).toBe(false);
      expect(refused(guesserLive, ids[24])).toBe(true);
      const lateId = guesserLive.watch('classLookup', 'watchByCode', cls.session.code);
      await guesserLive.until(() => guesserLive.refusalOf(lateId) !== undefined);
      expect(await holderLive.firstValue<Session | null>('classLookup', 'watchByCode', cls.session.code)).toMatchObject({ code: cls.session.code });
      expect(await cls.admin.firstValue<Session | null>('classLookup', 'watchByCode', cls.session.code)).toMatchObject({ code: cls.session.code });

      await cls.admin.call('sessions', 'end', cls.sessionId);
      const stranger = device('10.32.0.1');
      await stranger.hello();
      const strangerLive = await stranger.open();
      expect(await strangerLive.firstValue<Session | null>('classLookup', 'watchByCode', cls.session.code)).toBeNull();
      expect(await holderLive.firstValue<Session | null>('classLookup', 'watchByCode', cls.session.code)).toMatchObject({ status: 'ended' });
      expect(await askerLive.firstValue<Session | null>('classLookup', 'watchByCode', cls.session.code)).toBeNull();
      [holderLive, askerLive, guesserLive, strangerLive, cls.admin].forEach((live) => live.close());
    });

    it('keeps a device’s seat when its socket closes and opens again with the same cookie, and treats another cookie as another device', async () => {
      const cls = await startClass();
      const phone = device();
      await phone.hello();
      const first = await phone.open();
      expect(await first.call('participants', 'join', cls.session.code, cls.groupId, cls.studentId)).toMatchObject({ ok: true });
      first.close();
      const again = await phone.open();
      const mine = await again.firstValue<Participant | null>('participants', 'watchMine', cls.sessionId);
      expect(mine).toMatchObject({ studentId: cls.studentId });
      const stranger = device();
      await stranger.hello();
      const strangerLive = await stranger.open();
      expect(await strangerLive.firstValue('participants', 'watchMine', cls.sessionId)).toBeNull();
      expect(stranger.cookieNamed('noha_device')).not.toBe(phone.cookieNamed('noha_device'));
      [again, strangerLive, cls.admin].forEach((live) => live.close());
    });
  });

  describe('the hub going to sleep', () => {
    let probed: Server;
    const probeDevice = (address?: string) => new Device(() => probed.origin, address);
    const instance = async (): Promise<string> => ((await (await fetch(`${probed.origin}${INSTANCE_PATH}`)).json()) as { instance: string }).instance;

    const probeState = mkdtempSync(join(tmpdir(), 'noha-pearls-probe-'));

    beforeAll(async () => {
      probed = await start(probeState, { withSecrets: true, config: PROBE_CONFIG });
    }, STARTUP_MS * 2);

    afterAll(async () => {
      await probed.stop();
      rmSync(probeState, { recursive: true, force: true });
    });

    it('is built again after sitting idle, which the test sees through the hub’s own construction id, and keeps a page’s live read and sends the change that wakes it', async () => {
      const visitor = probeDevice();
      await visitor.hello();
      const watcher = await visitor.open();
      const id = watcher.watch('teachers', 'watchTeachers');
      await watcher.until(() => watcher.valuesOf(id).length === 1);
      const before = await instance();
      expect(await instance()).toBe(before);
      await new Promise((resolve) => setTimeout(resolve, IDLE_UNTIL_EVICTED_MS));
      expect(await instance(), 'the hub was not built again, so it did not sleep').not.toBe(before);

      const signedIn = probeDevice('10.9.9.9');
      await signedIn.hello();
      expect(await signedIn.signIn(rightPassword(), await rightCode())).toBe(true);
      const live = await signedIn.open();
      expect(await live.call('teachers', 'add', 'After the sleep')).toMatchObject({ ok: true });
      await watcher.until(() => (watcher.valuesOf(id).at(-1) as Teacher[]).some((entry) => entry.name === 'After the sleep'));
      [watcher, live].forEach((socket) => socket.close());
    }, STARTUP_MS);
  });

  describe('the hub moving nearer the school', () => {
    let probed: Server;
    const probeState = mkdtempSync(join(tmpdir(), 'noha-pearls-move-'));

    beforeAll(async () => {
      probed = await start(probeState, { withSecrets: true, config: PROBE_CONFIG });
    }, STARTUP_MS * 2);

    afterAll(async () => {
      await probed.stop();
      rmSync(probeState, { recursive: true, force: true });
    });

    it('takes all the former hub’s data on its first start: a teacher added there, the teacher’s sign-in and the device; the former hub then answers nothing, also once built again', async () => {
      let target = `${probed.origin}${FORMER_HUB_PATH}`;
      const seat = new Device(() => target, '10.6.6.6');
      await seat.hello();
      expect(await seat.signIn(rightPassword(), await rightCode())).toBe(true);
      const before = await seat.open();
      expect(await before.call('teachers', 'add', 'Before the move')).toMatchObject({ ok: true });
      before.close();
      const deviceCookie = seat.cookieNamed('noha_device');

      target = probed.origin;
      expect((await seat.hello()).admin, 'the teacher’s sign-in did not move').toBe(true);
      expect(seat.cookieNamed('noha_device'), 'the device was given a new identity, so the device key did not move').toBe(deviceCookie);
      const after = await seat.open();
      const teachers = await after.firstValue<Teacher[]>('teachers', 'watchTeachers');
      expect(teachers.map((entry) => entry.name)).toContain('Before the move');
      after.close();

      await probed.stop();
      probed = await start(probeState, { withSecrets: true, config: PROBE_CONFIG });
      target = `${probed.origin}${FORMER_HUB_PATH}`;
      expect((await seat.post('/api/hello')).status, 'the former hub answered again once built again, so its retirement was not kept').toBe(STATUS_HUB_MOVED);
    }, STARTUP_MS * 2);
  });

  describe('a restart on the same storage', () => {
    it('keeps the data, the teacher’s cookie and the device identity, and gives an open watch its value again after reconnecting', async () => {
      const signedIn = await teacher('10.7.7.7');
      const live = await signedIn.open();
      await live.call('teachers', 'add', 'Survivor');
      const seat = device();
      await seat.hello();
      const before = await (await seat.open()).firstValue<Teacher[]>('teachers', 'watchTeachers');
      const deviceCookie = seat.cookieNamed('noha_device');
      const watching = live.watch('teachers', 'watchTeachers');
      await live.until(() => live.valuesOf(watching).length > 0);

      await server.stop();
      server = await start(stateDir, { withSecrets: true });
      const reopened = await signedIn.open();
      expect(reopened.hello()).toMatchObject({ admin: true });
      const afterwards = await reopened.firstValue<Teacher[]>('teachers', 'watchTeachers');
      expect(afterwards.map((entry) => entry.name)).toEqual(expect.arrayContaining(['Survivor', ...before.map((entry) => entry.name)]));
      expect(seat.cookieNamed('noha_device')).toBe(deviceCookie);
      expect((await seat.hello()).admin).toBe(false);
      reopened.close();
    }, STARTUP_MS * 2);

    it('refuses every sign-in, and no longer honours old teacher cookies, when started without the secrets', async () => {
      const old = await teacher('10.8.8.8');
      await server.stop();
      server = await start(stateDir, { withSecrets: false });
      const same = new Device(() => server.origin, '10.8.8.8');
      for (const name of ['noha_device', 'noha_admin']) same.forget(name);
      await same.hello();
      expect(await same.signIn(rightPassword(), await rightCode())).toBe(false);
      expect(await same.signIn(LOCAL_ADMIN_SECRETS.ADMIN_PASSWORD, await rightCode())).toBe(false);
      expect(old.cookieNamed('noha_admin')).toBeDefined();
      const carried = new Device(() => server.origin);
      await carried.hello();
      const live = await LiveSocket.open(server.origin, `${carried.cookie}; noha_admin=${old.cookieNamed('noha_admin')}`);
      expect(live.hello()).toMatchObject({ admin: false });
      live.close();
    }, STARTUP_MS * 2);
  });

  describe('a hub started without the sample-school variable, as a school’s is', () => {
    it('has the site’s wording and the example lesson, and no teacher, class list or student of anyone’s invention', async () => {
      const fresh = mkdtempSync(join(tmpdir(), 'noha-pearls-bare-'));
      const bare = await start(fresh, { withSecrets: false });
      try {
        const visitor = new Device(() => bare.origin);
        await visitor.hello();
        const live = await visitor.open();
        expect(await live.firstValue<{ schoolName: string }>('content', 'watchSite')).toMatchObject({ schoolName: expect.any(String) });
        expect((await live.firstValue<LessonSummary[]>('lessons', 'watchLessons')).length).toBeGreaterThan(0);
        expect(await live.firstValue<Teacher[]>('teachers', 'watchTeachers')).toEqual([]);
        live.close();
      } finally {
        await bare.stop();
        rmSync(fresh, { recursive: true, force: true });
      }
    }, STARTUP_MS * 2);
  });
});
