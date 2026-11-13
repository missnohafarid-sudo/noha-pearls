// Shared by check.mjs, ship.mjs and undo.mjs: run a command, and stop with a plain message.
import { spawnSync } from 'node:child_process';

const onWindows = process.platform === 'win32';

/** Runs a command in the project folder and returns its exit status and (when `capture`) its output. */
export function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    // npm is a .cmd file on Windows and needs the shell. git must not get one: a shell splits a commit message at its spaces.
    shell: onWindows && command === 'npm',
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

export const git = (...args) => run('git', args, { capture: true });

export const npm = (...args) => run('npm', args);

/** Prints a plain message to the reader and stops. */
export function stop(message, status = 1) {
  console.error(`\n${message}`);
  process.exit(status);
}
