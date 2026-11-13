import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, HTTPRequest, Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Lesson, LessonSummary, Session, Teacher } from '../src/domain/models';
import { t } from '../src/i18n';
import { Device as Tab, DESKTOP } from './device';
import { Device, type LiveSocket, rightCode, rightPassword } from './hubClient';
import { lessonFileText, PICTURE_HOST, answerPictureRequest } from './lessonLane';
import { build, start, STARTUP_MS, stopEverything, type Server } from './serverProcess';
import { launchBrowser } from './world';

/**
 * The site as the real local server serves it, with the headers of `public/_headers`: the pages the policy could break are driven in
 * a browser signed in as the teacher, and every violation the browser reports is collected. A page that tries forbidden things shows
 * the collector works.
 */

const HEADERS_FILE = readFileSync('public/_headers', 'utf8');
const headerLine = (name: string): string => HEADERS_FILE.split('\n').find((line) => line.trim().startsWith(`${name}:`))!.trim().slice(name.length + 1).trim();
const stateDir = mkdtempSync(join(tmpdir(), 'noha-pearls-csp-'));
const DRIVE_PREVIEW_PATH = '/file/d/FILE_ID_1/preview';
const MEDIA_LINK = 'https://drive.google.com/file/d/FILE_ID_1/view?usp=drive_link';
const PICTURE_SLIDE = 1;
const MEDIA_SLIDE = 2;
const SCAN_SLIDE = 3;

const lessonSlides = [
  { kind: 'content', title: 'Opening', body: 'x' },
  { kind: 'content', title: 'With a picture', body: 'Text', images: [`https://${PICTURE_HOST}/one`] },
  { kind: 'media', title: 'With a frame', tag: 'Show', url: MEDIA_LINK, media: 'auto', body: 'Under the frame' },
  { kind: 'choice', title: 'Cards', prompt: 'Which one?', options: ['a', 'b', 'c', 'd'], correct: null, explanation: '', scope: 'individual', points: 1 },
];

/** The made-up picture host answers with a drawing and Google Drive with an empty page; any other address goes on to the network. */
function answerRequest(request: HTTPRequest): void {
  const { hostname, pathname } = new URL(request.url());
  if (hostname === 'drive.google.com' && pathname === DRIVE_PREVIEW_PATH) void request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>blank</title>' });
  else answerPictureRequest(request);
}

/** Every violation the page's browser reports: the page's own event, and the console line Chrome writes for it. */
async function collectViolations(page: Page): Promise<string[]> {
  const found: string[] = [];
  await page.exposeFunction('reportViolation', (what: string) => found.push(what));
  await page.evaluateOnNewDocument(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { reportViolation(what: string): void }).reportViolation(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) found.push(`console: ${message.text()}`);
  });
  return found;
}

describe('the security headers on the real local server', () => {
  let server: Server;
  let browser: Browser;
  let tab: Tab;
  let violations: string[];
  let lesson: Lesson;
  let session: Session;
  let admin: LiveSocket;

  const rendered = (): Promise<unknown> => tab.page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0);
  const open = async (hash: string): Promise<void> => {
    await tab.page.goto(`${server.origin}/${hash}`, { waitUntil: 'networkidle0' });
    await rendered();
  };

  beforeAll(async () => {
    build();
    server = await start(stateDir, { withSecrets: true });
    const teacher = new Device(() => server.origin, '10.9.9.9');
    await teacher.hello();
    expect(await teacher.signIn(rightPassword(), await rightCode())).toBe(true);
    admin = await teacher.open();
    const imported = await admin.call('lessons', 'importFromText', lessonFileText(lessonSlides, 'Headers lesson'), null);
    lesson = (imported as { value: { lesson: Lesson } }).value.lesson;
    const [lessons, classes, teachers] = await Promise.all([
      admin.firstValue<LessonSummary[]>('lessons', 'watchLessons'),
      admin.firstValue<{ id: string }[]>('roster', 'watchClasses'),
      admin.firstValue<Teacher[]>('teachers', 'watchTeachers'),
    ]);
    expect(lessons.some((entry) => entry.id === lesson.id)).toBe(true);
    session = ((await admin.call('sessions', 'start', lesson.id, classes[0].id, teachers[0].id)) as { value: Session }).value;

    browser = await launchBrowser();
    tab = await Tab.open(browser, 'teacher', 'about:blank', DESKTOP, []);
    for (const name of ['noha_admin', 'noha_device']) await tab.page.setCookie({ name, value: teacher.cookieNamed(name)!, url: server.origin });
    await tab.page.setRequestInterception(true);
    tab.page.on('request', answerRequest);
    violations = await collectViolations(tab.page);
  }, STARTUP_MS * 3);

  afterAll(async () => {
    await browser?.close();
    admin?.close();
    await stopEverything();
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('serves every page, deep links included, with the policy and the other headers of public/_headers', async () => {
    for (const path of ['/', '/some/deep/link', '/index.html']) {
      const response = await fetch(`${server.origin}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-security-policy'), path).toBe(headerLine('Content-Security-Policy'));
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(response.headers.get('referrer-policy'), path).toBe(headerLine('Referrer-Policy'));
      expect(response.headers.get('x-frame-options'), path).toBe('DENY');
    }
    const policy = headerLine('Content-Security-Policy');
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('has no inline script in the built page', () => {
    const page = readFileSync('dist/client/index.html', 'utf8');
    expect(page.match(/<script(?![^>]*\ssrc=)[^>]*>/g)).toBeNull();
    expect(page).not.toMatch(/\son[a-z]+=/);
  });

  it('renders the home page for the signed-in teacher with no violation', async () => {
    await open('#/');
    expect(await tab.has(t.shell.adminBadge)).toBe(true);
    expect(violations).toEqual([]);
  });

  it('shows a lesson picture and a media frame with no violation', async () => {
    await open(`#/lesson/${encodeURIComponent(lesson.id)}/${PICTURE_SLIDE + 1}`);
    await tab.until('the loaded picture', () => tab.page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('.slide-pictures__image')].some((image) => image.complete && image.naturalWidth > 0)));
    await open(`#/lesson/${encodeURIComponent(lesson.id)}/${MEDIA_SLIDE + 1}`);
    await tab.until('the frame', () => tab.page.evaluate(() => document.querySelector('.slide iframe') !== null));
    await tab.until('the frame loaded', async () => tab.page.frames().some((frame) => frame.url().includes(DRIVE_PREVIEW_PATH)));
    expect(violations).toEqual([]);
  });

  it('draws the join QR codes and the answer cards with no violation', async () => {
    await open(`#/session/${encodeURIComponent(session.code)}`);
    await tab.click(t.session.showJoinCodes);
    await tab.until('the QR codes', async () => (await tab.count('.qr svg')) > 0);
    await open('#/cards');
    await tab.until('the answer cards', async () => (await tab.count('.answer-card svg')) > 0);
    expect(violations).toEqual([]);
  });

  it('opens the card scanner on the fake camera with no violation', async () => {
    await admin.call('sessions', 'goTo', session.id, SCAN_SLIDE);
    await open(`#/session/${encodeURIComponent(session.code)}`);
    await tab.click(t.session.scan);
    await tab.until('the scanner', () => tab.exists('.scanner__video'));
    await tab.until('the camera picture', () => tab.page.evaluate(() => (document.querySelector<HTMLVideoElement>('.scanner__video')?.readyState ?? 0) >= 2));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(violations).toEqual([]);
  });

  it('reports what the policy forbids, so the empty lists above mean something', async () => {
    await open('#/');
    violations.length = 0;
    await tab.page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__ran = true';
      document.body.append(script);
      const image = document.createElement('img');
      image.src = 'http://insecure.test/x.png';
      document.body.append(image);
      const frame = document.createElement('iframe');
      frame.src = 'http://insecure.test/';
      document.body.append(frame);
    });
    await tab.until('the reports', async () => violations.some((line) => line.startsWith('script-src')) && violations.some((line) => line.startsWith('img-src')) && violations.some((line) => line.startsWith('frame-src')));
    expect(await tab.page.evaluate(() => (window as unknown as { __ran?: boolean }).__ran)).toBeUndefined();
  });
});
