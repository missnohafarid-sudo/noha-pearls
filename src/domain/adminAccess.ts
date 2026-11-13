/** How long things last, and when an address is shut out of sign-in. All times are milliseconds. */

import { DAY_MS } from './periods';

/** A teacher stays signed in on a device for a week unless she signs out (docs/PLAN.md 2.5). */
export const ADMIN_SESSION_MS = 7 * DAY_MS;

/** A device keeps its identity for about thirteen months, which is as long as a browser allows; each visit starts the time again. */
export const DEVICE_COOKIE_MS = 400 * DAY_MS;

/** The shortest admin password the hub accepts as a secret. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * SHA-256 of the development password and of the development authenticator key, which are public in this repository.
 * A deployed hub that finds its secrets equal to these refuses every sign-in. Only the hashes are kept here, so a build holds
 * neither value itself.
 */
export const DEVELOPMENT_SECRET_HASHES = {
  password: 'bfe3ee1676b57a46eca785d10b7b9448be13a88ec5842042f730da4650a8b36a',
  totpSecret: '8be5d113c0871ce1a122d68a7dff940ab7b09ad8dfcfd9a85aa5c1acc026279e',
} as const;

/** Sign-in is allowed over plain http only on the computer itself. */
export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export const WRONG_ATTEMPTS_ALLOWED = 5;
export const LOCK_MS = 15 * 60 * 1000;

export function adminExpiryFrom(now: number): number {
  return now + ADMIN_SESSION_MS;
}

/** The teacher's cookie counts only until the moment it names. */
export function isAdminSessionActive(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && expiresAt > now;
}

/** What is known of one network address's wrong attempts. */
export interface AttemptRecord {
  failures: number;
  lastAt: number;
  lockedUntil: number;
}

export function isLocked(record: AttemptRecord | null, now: number): boolean {
  return record !== null && record.lockedUntil > now;
}

/**
 * The record after one more wrong attempt. Wrong attempts older than the lock time are forgotten, so a slip
 * last month does not count; the fifth within that time locks the address.
 */
export function afterWrongAttempt(record: AttemptRecord | null, now: number): AttemptRecord {
  const recent = record !== null && now - record.lastAt < LOCK_MS;
  const failures = (recent ? record.failures : 0) + 1;
  return { failures, lastAt: now, lockedUntil: failures >= WRONG_ATTEMPTS_ALLOWED ? now + LOCK_MS : 0 };
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** The eight 16-bit groups of an IPv6 address, or null when the text is not one. */
function ipv6Groups(text: string): number[] | null {
  const tail = text.slice(text.lastIndexOf(':') + 1);
  const four = IPV4.exec(tail);
  const body = four ? `${text.slice(0, text.lastIndexOf(':') + 1)}${((Number(four[1]) << 8) | Number(four[2])).toString(16)}:${((Number(four[3]) << 8) | Number(four[4])).toString(16)}` : text;
  const halves = body.split('::');
  if (halves.length > 2) return null;
  const [head, rest] = halves.map((half) => (half === '' ? [] : half.split(':')));
  const missing = 8 - head.length - (rest?.length ?? 0);
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...(rest ?? [])];
  return groups.every((group) => /^[0-9a-f]{1,4}$/.test(group)) ? groups.map((group) => parseInt(group, 16)) : null;
}

/**
 * What a sign-in lockout is counted against. An IPv4 address counts alone; an IPv6 address counts as its /64 prefix, which one
 * household or school network holds whole, so rotating inside it does not escape the lock; an IPv4-mapped IPv6 address counts as its IPv4.
 * Text that is no address counts as itself.
 */
export function attemptKeyOf(address: string): string {
  const text = address.trim().toLowerCase().replace(/%.*$/, '');
  if (!text.includes(':')) return text;
  const groups = ipv6Groups(text);
  if (!groups) return text;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}
