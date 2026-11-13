import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LessonSummary, Session, Teacher } from '../src/domain/models';
import { t } from '../src/i18n';
import { Device as Tab, PHONE } from './device';
import { Device, type LiveSocket, rightCode, rightPassword } from './hubClient';
import { build, start, STARTUP_MS, stopEverything, type Server } from './serverProcess';
import { launchBrowser } from './world';

/**
 * A student who types the class code, on the real local server: the hub refuses text that cannot be a code, so the page must never
 * ask it about one. The walkthrough cannot see this, because its browser-only mode has no hub to refuse anything.
 */

const stateDir = mkdtempSync(join(tmpdir(), 'noha-pearls-join-'));
const CODE_FIELD = '.join-code input';
const NOT_A_CODE = 'AB-12';

describe('typing the class code on the real local server', () => {
  let server: Server;
  let browser: Browser;
  let student: Tab;
  let admin: LiveSocket;
  let session: Session;
  const errors: string[] = [];

  const open = (hash: string): Promise<unknown> => student.page.goto(`${server.origin}/${hash}`, { waitUntil: 'networkidle0' });
  const submitCode = async (code: string): Promise<void> => {
    await student.fill(CODE_FIELD, code);
    await student.page.keyboard.press('Enter');
  };

  beforeAll(async () => {
    build();
    server = await start(stateDir, { withSecrets: true });
    const teacher = new Device(() => server.origin, '10.9.9.8');
    await teacher.hello();
    expect(await teacher.signIn(rightPassword(), await rightCode())).toBe(true);
    admin = await teacher.open();
    const [lessons, classes, teachers] = await Promise.all([
      admin.firstValue<LessonSummary[]>('lessons', 'watchLessons'),
      admin.firstValue<{ id: string }[]>('roster', 'watchClasses'),
      admin.firstValue<Teacher[]>('teachers', 'watchTeachers'),
    ]);
    session = ((await admin.call('sessions', 'start', lessons[0].id, classes[0].id, teachers[0].id)) as { value: Session }).value;

    browser = await launchBrowser();
    student = await Tab.open(browser, 'student', 'about:blank', PHONE, errors);
  }, STARTUP_MS * 3);

  afterAll(async () => {
    await browser?.close();
    admin?.close();
    await stopEverything();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('shows a signed-out student the code field while a class runs', async () => {
    await open('#/');
    await student.waitFor(t.home.liveNowVisitor);
    expect(await student.exists(CODE_FIELD)).toBe(true);
    expect(await student.has(t.common.crashed)).toBe(false);
  });

  it('tells her a code with punctuation is wrong, and the page stays', async () => {
    await submitCode(NOT_A_CODE);
    await student.waitFor(t.home.join.wrongCode);
    expect(await student.has(t.common.crashed)).toBe(false);
  });

  it('opens the class when she types its code', async () => {
    await submitCode(session.code.toLowerCase());
    await student.until('the groups to choose from', async () => (await student.count('.join-group')) > 0);
    expect(await student.has(t.home.join.wrongCode)).toBe(false);
  });

  it('tells a visitor on the board that text which is no code names no class', async () => {
    await open(`#/board/${encodeURIComponent(NOT_A_CODE)}`);
    await student.waitFor(t.session.unknownCode(NOT_A_CODE));
    expect(await student.has(t.common.crashed)).toBe(false);
  });

  it('raised no page error', () => {
    expect(errors).toEqual([]);
  });
});
