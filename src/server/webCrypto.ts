const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await sha256(text));
}

/** A fresh random secret, 256 bits, in URL-safe text. */
export function randomToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmacHex(key: CryptoKey, text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))));
}

/**
 * Whether two texts are equal, in time that does not depend on where they differ or how long they are: both are
 * reduced to a 32-byte digest, and every byte of the digests is compared.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [first, second] = await Promise.all([sha256(a), sha256(b)]);
  let difference = 0;
  for (let i = 0; i < first.length; i++) difference |= first[i] ^ second[i];
  return difference === 0;
}
