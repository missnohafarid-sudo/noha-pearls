import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { LOCAL_ADMIN_SECRETS } from '../vite.config';

/**
 * The real local server: the built site and the Worker with its hub, run by `wrangler dev` from what `vite build` made,
 * with the hub's storage kept in a folder the test gives, so a restart can be checked. Every process is stopped at the end.
 */

export const HOST = '127.0.0.1';
export const BUILT_WRANGLER_CONFIG = 'dist/noha_pearls/wrangler.json';
export const STARTUP_MS = 90_000;
const STOP_WAIT_MS = 15_000;

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

/** Builds the site and the Worker together, as `npm run build` does; `extra` is added to the build's environment (the walkthrough's switch is otherwise left out). */
export function build(extra: Record<string, string> = {}): void {
  const { VITEST: _inTest, NOHA_SITE_ONLY: _siteOnly, ...environment } = process.env;
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'], { env: { ...environment, ...extra }, stdio: 'inherit' });
}

export interface Server {
  origin: string;
  stop(): Promise<void>;
}

/**
 * Starts the built Worker, or the Worker of another configuration file (`config`) that serves the same built site. The development
 * sign-in goes on the command line, only when asked: the built files never hold it.
 */
export async function start(stateDir: string, { withSecrets, config = BUILT_WRANGLER_CONFIG }: { withSecrets: boolean; config?: string }): Promise<Server> {
  const port = await freePort();
  const secrets = withSecrets ? Object.entries(LOCAL_ADMIN_SECRETS).flatMap(([name, value]) => ['--var', `${name}:${value}`]) : [];
  const child = spawn(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'dev', '-c', config, '--ip', HOST, '--port', String(port), '--persist-to', stateDir, ...secrets],
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
  return { origin: `http://${HOST}:${port}`, stop: () => stopAndWait(child) };
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

export const stopEverything = (): Promise<void[]> => Promise.all([...running].map(stopAndWait));
