import { MAX_POST_BODY_BYTES } from '../ports/limits';

/**
 * A plain request's body is limited by bytes, before and while it is read: it must say how long it is, that length must be within
 * the limit, and reading stops at the limit even if the length told less than the body holds.
 */

/** The refusal for a request that names no length, or a length over the limit; null when it may be read. Costs nothing: no body is touched. */
export function bodyRefusal(request: Request): Response | null {
  const length = request.headers.get('Content-Length');
  if (length === null || !/^\d{1,10}$/.test(length)) return new Response('Length required', { status: 411 });
  return Number(length) > MAX_POST_BODY_BYTES ? new Response('Payload too large', { status: 413 }) : null;
}

/** The body as text, or null when it is longer than the limit; no more than the limit (and one chunk) is ever held. */
export async function readLimitedText(request: Request): Promise<string | null> {
  if (bodyRefusal(request) !== null) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_POST_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
