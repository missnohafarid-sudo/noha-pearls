import { toAsciiDigits } from './digits';
import type { Id } from './models';

export function newId(): Id {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** No 0/O, 1/I/L: the code is read aloud and typed by students. */
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newJoinCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join('');
}

/** What a student typed, made comparable to a stored code: no spaces, Latin digits, upper case. */
export function normalizeJoinCode(text: string): string {
  return toAsciiDigits(text.replace(/\s+/g, '')).toUpperCase();
}
