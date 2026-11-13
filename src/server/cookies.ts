/** Reading the `Cookie` header and writing `Set-Cookie` lines. */

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const raw of (header ?? '').split(';')) {
    const part = raw.trim();
    const at = part.indexOf('=');
    if (at > 0) cookies.set(part.slice(0, at), part.slice(at + 1));
  }
  return cookies;
}

export interface CookieOptions {
  /** Seconds the browser keeps it; 0 removes it. */
  maxAgeSeconds: number;
  /** Not on plain-http localhost, where the browser would refuse to send it back. */
  secure: boolean;
}

/** Page scripts cannot read it (HttpOnly), it goes only to this site (SameSite=Strict) and only to the API. */
export function cookieLine(name: string, value: string, { maxAgeSeconds, secure }: CookieOptions): string {
  return [`${name}=${value}`, 'Path=/api', `Max-Age=${maxAgeSeconds}`, 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : [])].join('; ');
}

export const clearedCookieLine = (name: string, secure: boolean): string => cookieLine(name, '', { maxAgeSeconds: 0, secure });
