const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_DIGITS = 8;
const FINGERPRINT = new RegExp(`^[0-9a-f]{${HEX_DIGITS}}$`);

/** A short stable name for a text: its FNV-1a hash as 8 hex characters. Equal texts have equal names; it is a name, not a secret. */
export function fingerprint(text: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(HEX_DIGITS, '0');
}

export const isFingerprint = (value: unknown): value is string => typeof value === 'string' && FINGERPRINT.test(value);
