import { totpCode } from '../src/infrastructure/totp';
import { LOCAL_ADMIN_SECRETS } from '../vite.config';

/** The only home of the walkthrough's sign-in: the page's browser-only mode accepts the public development pair, and the walkthrough types it. */
const TEST_PASSWORD = LOCAL_ADMIN_SECRETS.ADMIN_PASSWORD;
const TEST_TOTP_KEY = LOCAL_ADMIN_SECRETS.ADMIN_TOTP_SECRET;

export const WRONG_PASSWORD = 'not-the-password-0000';

export const rightPassword = (): string => TEST_PASSWORD;

export const rightCode = (): Promise<string> => totpCode(TEST_TOTP_KEY, Date.now());

/** A code that is wrong now and in the neighbouring time steps the app also accepts. */
export async function wrongCode(): Promise<string> {
  const accepted = new Set<string>();
  for (const offset of [-60_000, 0, 60_000]) accepted.add(await totpCode(TEST_TOTP_KEY, Date.now() + offset));
  for (let n = 100_000; ; n++) if (!accepted.has(String(n))) return String(n);
}
