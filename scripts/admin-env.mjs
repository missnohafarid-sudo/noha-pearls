// Used by the deploy workflow: checks the admin secrets and prints the build
// variables (one per line) for $GITHUB_ENV. Fails, so no site goes out without them.
import { createHash } from 'node:crypto';
import { isTotpSecret } from '../src/infrastructure/totp.ts';

const MIN_PASSWORD_LENGTH = 8;

const { ADMIN_PASSWORD: password, ADMIN_TOTP_SECRET: totpSecret } = process.env;

if (!password || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`::error::Set the ADMIN_PASSWORD repository secret to ${MIN_PASSWORD_LENGTH} characters or more (Settings > Secrets and variables > Actions).`);
  process.exit(1);
}
if (!totpSecret || !isTotpSecret(totpSecret)) {
  console.error('::error::Set the ADMIN_TOTP_SECRET repository secret to a valid key (make one with: npm run admin:2fa).');
  process.exit(1);
}

console.log(`VITE_ADMIN_PASSWORD_SHA256=${createHash('sha256').update(password).digest('hex')}`);
console.log(`VITE_ADMIN_TOTP_SECRET=${totpSecret}`);
