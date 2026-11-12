import { describe, expect, it } from 'vitest';
import { generateTotpSecret, isTotpSecret, otpauthUri, totpCode, verifyTotp } from './totp';

/** Base32 of the RFC 6238 test key, the ASCII text 12345678901234567890. */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 vectors', async () => {
    const vectors: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']];
    for (const [seconds, code] of vectors) expect(await totpCode(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it('accepts the current and previous step, not two steps ago', async () => {
    const now = 1_700_000_000_000;
    expect(await verifyTotp(RFC_SECRET, await totpCode(RFC_SECRET, now), now)).toBe(true);
    expect(await verifyTotp(RFC_SECRET, await totpCode(RFC_SECRET, now - 30_000), now)).toBe(true);
    expect(await verifyTotp(RFC_SECRET, await totpCode(RFC_SECRET, now - 60_000), now)).toBe(false);
  });

  it('ignores spaces and rejects malformed input', async () => {
    const now = 59_000;
    expect(await verifyTotp(RFC_SECRET, '287 082', now)).toBe(true);
    expect(await verifyTotp(RFC_SECRET, '28708', now)).toBe(false);
    expect(await verifyTotp(RFC_SECRET, 'abcdef', now)).toBe(false);
    expect(await verifyTotp('not base32!', '287082', now)).toBe(false);
  });

  it('accepts ASCII digits only', async () => {
    expect(await verifyTotp(RFC_SECRET, '٢٨٧٠٨٢', 59_000)).toBe(false);
  });

  it('generates secrets that pass the check', () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32);
    expect(isTotpSecret(secret)).toBe(true);
    expect(isTotpSecret('abc')).toBe(false);
    expect(otpauthUri(secret, 'admin', "Noha's Pearls")).toContain(`secret=${secret}`);
  });
});
