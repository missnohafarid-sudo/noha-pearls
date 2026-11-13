// Used by the deploy workflow: checks the admin secrets and writes the file of Worker secrets
// that `wrangler deploy --secrets-file` uploads. Fails, so no site goes out with weak or public ones.
// Usage: node scripts/worker-secrets.mjs <file>   (secrets come from the environment, never from arguments)
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { isTotpSecret } from '../src/infrastructure/totp.ts';

// The source imports each other without file endings (the bundler's way); Node needs them, so add `.ts`.
registerHooks({
  resolve(specifier, context, next) {
    return next(/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
  },
});
const { MIN_PASSWORD_LENGTH, usesDevelopmentValue } = await import('../src/domain/adminAccess.ts');

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

const file = process.argv[2];
const { ADMIN_PASSWORD: password, ADMIN_TOTP_SECRET: totpSecret } = process.env;

if (!file) fail('Usage: node scripts/worker-secrets.mjs <file>');
if (!password || password.length < MIN_PASSWORD_LENGTH) {
  fail(`Set the ADMIN_PASSWORD repository secret to ${MIN_PASSWORD_LENGTH} characters or more (Settings > Secrets and variables > Actions).`);
}
if (!totpSecret || !isTotpSecret(totpSecret)) fail('Set the ADMIN_TOTP_SECRET repository secret to a valid key (make one with: npm run admin:2fa).');
if (usesDevelopmentValue({ password: sha256(password), totpSecret: sha256(totpSecret) })) {
  fail('ADMIN_PASSWORD or ADMIN_TOTP_SECRET is a public development value. Replace it with a private one (the key: npm run admin:2fa).');
}

writeFileSync(file, JSON.stringify({ ADMIN_PASSWORD: password, ADMIN_TOTP_SECRET: totpSecret }), { mode: 0o600 });
