import puppeteer, { type Browser } from 'puppeteer';
import { STORAGE_NAMESPACE } from '../src/app/config';
import type { Device } from './device';
import { writeCardVideo, CARD_TURNS } from './cardVideo';
import { rightCode, rightPassword } from './testAdmin';
import { t } from '../src/i18n';

/** The answer card the fake camera shows; it belongs to the student with this card number. */
export const CAMERA_CARD_NUMBER = 2;

export interface RosterEntry {
  name: string;
  cardNumber: number;
  groupId: string;
}

/** What the steps of one walkthrough share: one browser, its tabs, and facts learned along the way. */
export interface World {
  baseUrl: string;
  browser: Browser;
  errors: string[];
  admin: Device;
  student: Device;
  visitor: Device;
  roster: RosterEntry[];
  /** The seeded school class and its teacher. */
  firstClassName: string;
  firstTeacherName: string;
  /** The code of the class the walkthrough starts first; later steps open it by this, never by what the page lists. */
  firstClassCode: string;
  importedLessonId: string;
  joinUrl: string;
  /** The slide (0-based) the teacher's presentation shows. */
  stageSlide: number;
}

export async function launchBrowser(): Promise<Browser> {
  const args = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${writeCardVideo(CAMERA_CARD_NUMBER, CARD_TURNS)}`,
    '--lang=ar',
  ];
  if (process.env.CI) args.push('--no-sandbox');
  return puppeteer.launch({ headless: true, args });
}

const PASSWORD_FIELD = 'dialog[open] input[type=password]';

/** Presses the site frame's sign-in button and waits for the prompt. */
export async function openSignIn(device: Device): Promise<void> {
  await device.click(t.shell.signIn, '.shell__bar');
  await device.until('the sign-in prompt', () => device.exists(PASSWORD_FIELD));
}

const CODE_FIELD = 'dialog[open] input[inputmode=numeric]';

/** Fills both sign-in fields and submits; the prompt must already be open. */
export async function submitLogin(device: Device, password: string, code: string): Promise<void> {
  await device.fill(PASSWORD_FIELD, password);
  await device.fill(CODE_FIELD, code);
  await device.page.keyboard.press('Enter');
}

/** A refused attempt empties the code field and says so. */
export async function expectRefused(device: Device): Promise<void> {
  await device.until('a refused sign-in', async () => (await device.has(t.shell.unlock.wrong)) && (await device.page.$eval(CODE_FIELD, (field) => (field as HTMLInputElement).value)) === '');
  if (await isAdminMode(device)) throw new Error('A refused sign-in still opened the admin mode.');
}

export const isAdminMode = (device: Device): Promise<boolean> => device.has(t.shell.adminBadge);

export async function signInAsAdmin(device: Device): Promise<void> {
  await submitLogin(device, rightPassword(), await rightCode());
  await device.until('the admin mode', () => isAdminMode(device));
}

/** Everything stored for one collection, read from the page's own browser storage. */
export function storedRecords<T>(device: Device, collection: string): Promise<T[]> {
  return device.page.evaluate(
    (prefix) =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => JSON.parse(value) as never),
    `${STORAGE_NAMESPACE}/${collection}/`,
  );
}
