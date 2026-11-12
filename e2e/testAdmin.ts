import { createHash } from 'node:crypto';
import { totpCode } from '../src/infrastructure/totp';

/** The only home of the test sign-in: the build is made with these, and the walkthrough types them. */
const TEST_PASSWORD = 'walkthrough-pass-2468';
const TEST_TOTP_KEY = 'JBSWY3DPEHPK3PXP';

export const WRONG_PASSWORD = 'not-the-password-0000';

/** The two variables the production build reads for its admin sign-in. */
export function adminBuildVariables(): Record<string, string> {
  return {
    VITE_ADMIN_PASSWORD_SHA256: createHash('sha256').update(TEST_PASSWORD).digest('hex'),
    VITE_ADMIN_TOTP_SECRET: TEST_TOTP_KEY,
  };
}

export const rightPassword = (): string => TEST_PASSWORD;

export const rightCode = (): Promise<string> => totpCode(TEST_TOTP_KEY, Date.now());

/** A code that is wrong now and in the neighbouring time steps the app also accepts. */
export async function wrongCode(): Promise<string> {
  const accepted = new Set<string>();
  for (const offset of [-60_000, 0, 60_000]) accepted.add(await totpCode(TEST_TOTP_KEY, Date.now() + offset));
  for (let n = 100_000; ; n++) if (!accepted.has(String(n))) return String(n);
}
