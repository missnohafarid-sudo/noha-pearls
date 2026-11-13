/** What every answer of the Worker and of the hub carries: `public/_headers` reaches only the static files. */
const API_HEADERS: Readonly<Record<string, string>> = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };

/** The one function every answer to an `/api/` request passes through. The socket upgrade (101) is left as it is: it carries the socket. */
export function withApiHeaders(response: Response): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(API_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
