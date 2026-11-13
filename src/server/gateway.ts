import { HEALTH_PATH, HUB_PATHS } from '../ports/wire';

/**
 * What the Worker answers by itself, so that a request the hub could not use never wakes it: the health check, and a 404 for any
 * `/api/` path the hub does not serve. Null means the request goes to the hub.
 */
export function answerWithoutHub(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  if (pathname === HEALTH_PATH) {
    return request.method === 'GET' || request.method === 'HEAD' ? Response.json({ ok: true }) : new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return HUB_PATHS.includes(pathname) ? null : new Response('Not found', { status: 404 });
}
