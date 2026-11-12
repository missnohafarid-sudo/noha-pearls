/** RFC 6238 time-based one-time codes (HMAC-SHA-1). No project imports: Node scripts load this file directly. */

const STEP_SECONDS = 30;
const DIGITS = 6;
/** Steps accepted on either side of the current one, for clock drift. */
const WINDOW_STEPS = 1;
const SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  if (clean === '') return null;
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function codeForStep(key: Uint8Array, step: number): Promise<string> {
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(step));
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counter));
  const offset = mac[mac.length - 1] & 15;
  const binary =
    ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

const stepOf = (timeMs: number) => Math.floor(timeMs / 1000 / STEP_SECONDS);

export async function totpCode(secretBase32: string, timeMs: number): Promise<string> {
  const key = base32Decode(secretBase32);
  if (!key) throw new Error('Malformed TOTP secret');
  return codeForStep(key, stepOf(timeMs));
}

/** Accepts ASCII digits only (spaces ignored); the caller converts other digit scripts. */
export async function verifyTotp(secretBase32: string, code: string, nowMs: number): Promise<boolean> {
  const key = base32Decode(secretBase32);
  const typed = code.replace(/\s+/g, '');
  if (!key || !new RegExp(`^\\d{${DIGITS}}$`).test(typed)) return false;
  const current = stepOf(nowMs);
  for (let step = current - WINDOW_STEPS; step <= current + WINDOW_STEPS; step++) {
    if ((await codeForStep(key, step)) === typed) return true;
  }
  return false;
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

export function isTotpSecret(value: string): boolean {
  return /^[A-Z2-7]+$/.test(value) && base32Decode(value) !== null && value.length >= 16;
}

export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query}`;
}
