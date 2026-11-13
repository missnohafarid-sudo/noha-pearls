import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { attemptKeyOf, DEVELOPMENT_SECRET_HASHES, isCodeGuess, isLocalHost, MIN_PASSWORD_LENGTH, adminExpiryFrom, ADMIN_SESSION_MS, isAdminSessionActive, secretsHonoured, signInOutcome, usesDevelopmentValue } from './adminAccess';

describe('the teacher session', () => {
  it('lasts seven days and counts only until then', () => {
    const expiresAt = adminExpiryFrom(1000);
    expect(expiresAt - 1000).toBe(ADMIN_SESSION_MS);
    expect(isAdminSessionActive(expiresAt, expiresAt - 1)).toBe(true);
    expect(isAdminSessionActive(expiresAt, expiresAt)).toBe(false);
    expect(isAdminSessionActive(null, 0)).toBe(false);
  });
});

describe('how a sign-in attempt turned out', () => {
  it('names the password first: a wrong code counts as a guess at the six digits only behind the right password', () => {
    expect(signInOutcome(true, true)).toBe('signed-in');
    expect(signInOutcome(true, false)).toBe('wrong-code');
    expect(signInOutcome(false, true)).toBe('wrong-password');
    expect(signInOutcome(false, false)).toBe('wrong-password');
    expect(isCodeGuess('wrong-code')).toBe(true);
    expect(isCodeGuess('wrong-password')).toBe(false);
    expect(isCodeGuess('signed-in')).toBe(false);
  });
});

describe('the address a lockout is counted against', () => {
  it('is an IPv4 address as it is, and "local" or any other text as itself', () => {
    expect(attemptKeyOf('203.0.113.9')).toBe('203.0.113.9');
    expect(attemptKeyOf('local')).toBe('local');
    expect(attemptKeyOf(' Not-An-Address ')).toBe('not-an-address');
  });

  it('is the /64 prefix for an IPv6 address, however it is written', () => {
    const key = '2001:db8:1:2::/64';
    for (const form of ['2001:db8:1:2::1', '2001:DB8:1:2:ffff:ffff:ffff:ffff', '2001:0db8:0001:0002:0000:0000:0000:0003', '2001:db8:1:2:0:0:0:4', '2001:db8:1:2::', '2001:db8:1:2:a::b%eth0']) {
      expect(attemptKeyOf(form), form).toBe(key);
    }
    expect(attemptKeyOf('2001:db8:1:3::1')).not.toBe(key);
    expect(attemptKeyOf('2001:db8:2:2::1')).not.toBe(key);
    expect(attemptKeyOf('::1')).toBe('0:0:0:0::/64');
    expect(attemptKeyOf('::')).toBe('0:0:0:0::/64');
  });

  it('is the IPv4 address itself for an IPv4-mapped IPv6 address, so both spellings of one visitor count together', () => {
    expect(attemptKeyOf('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(attemptKeyOf('::FFFF:cb00:7109')).toBe('203.0.113.9');
    expect(attemptKeyOf('0:0:0:0:0:ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  it('is the text itself when an IPv6-looking address is malformed', () => {
    for (const bad of ['1::2::3', '12345::1', 'g::1', '1:2:3:4:5:6:7:8:9', '1:2:3']) expect(attemptKeyOf(bad), bad).toBe(bad);
  });
});

describe('where sign-in is allowed, and which secrets are never real', () => {
  it('allows plain http only on this computer', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) expect(isLocalHost(host)).toBe(true);
    for (const host of ['school.example', 'localhost.evil.example', '127.0.0.2', '']) expect(isLocalHost(host)).toBe(false);
  });

  it('knows the public development pair by its hashes, which are those of the values the repository states', () => {
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    expect(DEVELOPMENT_SECRET_HASHES).toEqual({ password: hash('teach-2468'), totpSecret: hash('JBSWY3DPEHPK3PXP') });
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('counts a secret pair as public when either value is the development one, and honours such a pair only on this computer', () => {
    const real = { password: 'x'.repeat(64), totpSecret: 'y'.repeat(64) };
    expect(usesDevelopmentValue(real)).toBe(false);
    expect(usesDevelopmentValue({ ...real, password: DEVELOPMENT_SECRET_HASHES.password })).toBe(true);
    expect(usesDevelopmentValue({ ...real, totpSecret: DEVELOPMENT_SECRET_HASHES.totpSecret })).toBe(true);
    expect(secretsHonoured(false, false)).toBe(true);
    expect(secretsHonoured(true, true)).toBe(true);
    expect(secretsHonoured(true, false)).toBe(false);
  });
});
