import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { attemptKeyOf, DEVELOPMENT_SECRET_HASHES, isLocalHost, MIN_PASSWORD_LENGTH, adminExpiryFrom, ADMIN_SESSION_MS, afterWrongAttempt, isAdminSessionActive, isLocked, LOCK_MS, WRONG_ATTEMPTS_ALLOWED, type AttemptRecord } from './adminAccess';

function wrongTimes(count: number, start = 0, gap = 1000): AttemptRecord {
  let record: AttemptRecord | null = null;
  for (let n = 0; n < count; n += 1) record = afterWrongAttempt(record, start + n * gap);
  return record as AttemptRecord;
}

describe('the teacher session', () => {
  it('lasts seven days and counts only until then', () => {
    const expiresAt = adminExpiryFrom(1000);
    expect(expiresAt - 1000).toBe(ADMIN_SESSION_MS);
    expect(isAdminSessionActive(expiresAt, expiresAt - 1)).toBe(true);
    expect(isAdminSessionActive(expiresAt, expiresAt)).toBe(false);
    expect(isAdminSessionActive(null, 0)).toBe(false);
  });
});

describe('the sign-in attempt limit', () => {
  it('does not lock before the fifth wrong attempt, and locks at the fifth for fifteen minutes', () => {
    expect(isLocked(wrongTimes(WRONG_ATTEMPTS_ALLOWED - 1), 5000)).toBe(false);
    const locked = wrongTimes(WRONG_ATTEMPTS_ALLOWED);
    const lastAt = (WRONG_ATTEMPTS_ALLOWED - 1) * 1000;
    expect(isLocked(locked, lastAt + LOCK_MS - 1)).toBe(true);
    expect(isLocked(locked, lastAt + LOCK_MS)).toBe(false);
  });

  it('forgets wrong attempts older than the lock time, so the count starts again', () => {
    const old = wrongTimes(4);
    const later = afterWrongAttempt(old, 3000 + LOCK_MS);
    expect(later.failures).toBe(1);
    expect(isLocked(later, 3000 + LOCK_MS)).toBe(false);
  });

  it('counts a lock that has run out as a fresh start', () => {
    const locked = wrongTimes(WRONG_ATTEMPTS_ALLOWED);
    expect(afterWrongAttempt(locked, locked.lockedUntil).failures).toBe(1);
  });

  it('knows nothing of an address never seen', () => {
    expect(isLocked(null, 0)).toBe(false);
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
});
