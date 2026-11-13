import { HEALTH_PATH, HUB_PATHS } from '../ports/wire';
import { withApiHeaders } from './apiHeaders';

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

/**
 * Every answer to an `/api/` request: what the Worker answers alone, or what `toHub` gives. If the hub or the Worker throws, the
 * platform's own error page would go out without the API headers, so a bare 500 goes out instead, and `report` hears of the error.
 */
export async function answerApi(request: Request, toHub: (request: Request) => Promise<Response>, report: (error: unknown) => void): Promise<Response> {
  try {
    return withApiHeaders(answerWithoutHub(request) ?? (await toHub(request)));
  } catch (error) {
    report(error);
    return withApiHeaders(new Response(null, { status: 500 }));
  }
}
