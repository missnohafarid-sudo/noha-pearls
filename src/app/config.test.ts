import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LOCAL_ADMIN_SECRETS } from '../../vite.config';
import { ADMIN_PASSWORD_SHA256, ADMIN_TOTP_SECRET, SITE_ONLY } from './config';

describe('the page’s settings', () => {
  it('hold only the public development pair for the browser-only sign-in, the same pair the local hub uses', () => {
    expect(ADMIN_PASSWORD_SHA256).toBe(createHash('sha256').update(LOCAL_ADMIN_SECRETS.ADMIN_PASSWORD).digest('hex'));
    expect(ADMIN_TOTP_SECRET).toBe(LOCAL_ADMIN_SECRETS.ADMIN_TOTP_SECRET);
  });

  it('keep the data in the browser only when the switch is exactly 1, which a test run does not set', () => {
    expect(SITE_ONLY).toBe(false);
  });
});
