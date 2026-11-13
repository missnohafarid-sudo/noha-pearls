import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The real local server: the built site and the Worker with its hub, run by `wrangler dev` from what `vite build` made,
 * with the hub's storage kept in a temporary folder so a restart can be checked. Every process and folder is removed at the end.
 */

const HOST = '127.0.0.1';
const BUILT_WRANGLER_CONFIG = 'dist/noha_pearls/wrangler.json';
const STARTUP_MS = 90_000;
const STOP_WAIT_MS = 15_000;

const stateDir = mkdtempSync(join(tmpdir(), 'noha-pearls-hub-'));
const running = new Set<ChildProcess>();

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** Builds the site and the Worker together, as `npm run build` does (the walkthrough's site-only variable must not be set). */
function build(): void {
  const { VITEST: _inTest, NOHA_SITE_ONLY: _siteOnly, ...environment } = process.env;
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'], { env: environment, stdio: 'inherit' });
}

interface Server {
  origin: string;
  stop(): Promise<void>;
}

async function start(): Promise<Server> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'dev', '-c', BUILT_WRANGLER_CONFIG, '--ip', HOST, '--port', String(port), '--persist-to', stateDir],
    { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  running.add(child);
  let log = '';
  const exited = new Promise<never>((_, reject) => child.once('exit', (code) => reject(new Error(`wrangler stopped with code ${code}\n${log}`))));
  const ready = new Promise<void>((resolve) => {
    const listen = (chunk: Buffer) => {
      log += chunk.toString();
      if (log.includes('Ready on')) resolve();
    };
    child.stdout?.on('data', listen);
    child.stderr?.on('data', listen);
  });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`the server did not start\n${log}`)), STARTUP_MS).unref());
  try {
    await Promise.race([ready, exited, timeout]);
  } catch (error) {
    await stopAndWait(child);
    throw error;
  }
  return {
    origin: `http://${HOST}:${port}`,
    stop: () => stopAndWait(child),
  };
}

/** Asks the server's whole process group to stop (wrangler starts the Worker runtime as a child). */
function kill(child: ChildProcess): void {
  running.delete(child);
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

const groupIsRunning = (pid: number): boolean => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Stops the server and returns once every process of it is gone. */
async function stopAndWait(child: ChildProcess): Promise<void> {
  kill(child);
  for (let waited = 0; child.pid !== undefined && groupIsRunning(child.pid) && waited < STOP_WAIT_MS; waited += 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const calls = async (server: Server): Promise<number> => ((await (await fetch(`${server.origin}/api/health`)).json()) as { calls: number }).calls;

describe('the local server', () => {
  let server: Server;

  beforeAll(async () => {
    build();
    server = await start();
  }, STARTUP_MS * 2);

  afterAll(async () => {
    await Promise.all([...running].map(stopAndWait));
    rmSync(stateDir, { recursive: true, force: true });
  });

  it('serves the site', async () => {
    const page = await fetch(`${server.origin}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
  });

  it('answers the health check through the hub, counting each call', async () => {
    const first = await calls(server);
    expect(await calls(server)).toBe(first + 1);
  });

  it('echoes a message on the live socket', async () => {
    const socket = new WebSocket(`${server.origin.replace('http', 'ws')}/api/live`);
    const echoed = new Promise<string>((resolve, reject) => {
      socket.addEventListener('open', () => socket.send('hello'));
      socket.addEventListener('message', (event) => resolve(String(event.data)));
      socket.addEventListener('error', () => reject(new Error('the socket failed')));
    });
    expect(await echoed).toBe('hello');
    socket.close();
  });

  it('keeps the hub’s data when the server is stopped and started again', async () => {
    const before = await calls(server);
    await server.stop();
    server = await start();
    expect(await calls(server)).toBe(before + 1);
  }, STARTUP_MS * 2);
});
