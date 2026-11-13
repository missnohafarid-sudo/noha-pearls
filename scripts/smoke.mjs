// After a deploy: proves the live site answers and is the real thing. Uses no secrets.
// Usage: node scripts/smoke.mjs <origin>   (for example https://noha-pearls.miss-noha-farid.workers.dev)
import { readFileSync } from 'node:fs';

const WAIT_MS = 90_000;
const POLL_MS = 3_000;
const SECURITY_HEADERS = ['Content-Security-Policy', 'X-Content-Type-Options'];

const origin = process.argv[2]?.replace(/\/$/, '');
if (!origin) {
  console.error('Usage: node scripts/smoke.mjs <origin>');
  process.exit(1);
}

class Failure extends Error {}
const expect = (ok, message) => {
  if (!ok) throw new Failure(message);
};

/** The headers the site promises on every page: the values in `public/_headers`, the one place they are written. */
function promisedHeaders() {
  const lines = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8').split('\n');
  return Object.fromEntries(
    SECURITY_HEADERS.map((name) => {
      const line = lines.find((text) => text.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`));
      expect(line, `public/_headers has no ${name}`);
      return [name, line.slice(line.indexOf(':') + 1).trim()];
    }),
  );
}

/** The request the page makes: a POST with a JSON body and its own address as the Origin. */
const post = (path, body = {}) =>
  fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });

async function waitForHealth() {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      if ((await fetch(`${origin}/api/health`)).status === 200) return;
    } catch {
      // not answering yet
    }
    expect(Date.now() < deadline, `${origin} did not answer /api/health within ${WAIT_MS / 1000} seconds`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const checks = [
  ['/api/health answers 200', async () => {
    const response = await fetch(`${origin}/api/health`);
    expect(response.status === 200, `/api/health answered ${response.status}`);
  }],
  ['/ is HTML with the security headers', async () => {
    const response = await fetch(`${origin}/`);
    expect(response.status === 200, `/ answered ${response.status}`);
    expect((response.headers.get('Content-Type') ?? '').includes('text/html'), `/ is not HTML (${response.headers.get('Content-Type')})`);
    for (const [name, value] of Object.entries(promisedHeaders())) {
      expect(response.headers.get(name) === value, `/ has a different ${name} than public/_headers`);
    }
  }],
  ['/api/hello says not admin and sets a safe device cookie', async () => {
    const response = await post('/api/hello');
    expect(response.status === 200, `/api/hello answered ${response.status}`);
    expect((await response.json()).admin === false, '/api/hello did not say the caller is not the admin');
    const cookie = response.headers.getSetCookie()[0];
    expect(cookie, 'the device cookie was not set');
    for (const part of ['Secure', 'HttpOnly', 'SameSite=Strict']) expect(cookie.includes(part), `the device cookie lacks ${part}`);
  }],
  ['a wrong sign-in is refused', async () => {
    const response = await post('/api/sign-in', { password: 'wrong-password-smoke-test', code: '000000' });
    expect(response.status === 200 && (await response.json()).ok === false, 'a wrong sign-in was not refused');
    expect(!response.headers.getSetCookie().length, 'a wrong sign-in set a cookie');
  }],
  ['an unknown /api path is 404 with the API headers', async () => {
    const response = await fetch(`${origin}/api/no-such-path`);
    expect(response.status === 404, `an unknown path answered ${response.status}`);
    expect(response.headers.get('X-Content-Type-Options') === 'nosniff', 'the 404 lacks X-Content-Type-Options: nosniff');
    expect(response.headers.get('Cache-Control') === 'no-store', 'the 404 lacks Cache-Control: no-store');
  }],
];

try {
  await waitForHealth();
  for (const [name, check] of checks) {
    await check();
    console.log(`ok   ${name}`);
  }
} catch (error) {
  console.error(`::error::Smoke test failed: ${error.message}`);
  process.exit(1);
}
