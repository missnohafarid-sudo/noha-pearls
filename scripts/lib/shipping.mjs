// Shared by ship.mjs, undo.mjs, discard.mjs and deployed.mjs: the scratch branch on GitHub and how this folder relates to main.
import { git, stop } from './process.mjs';

const MAIN_BRANCH = 'main';
export const TRY_BRANCH = 'try';
export const SENT_NOTE = 'Sent to the online check. NEXT: run `npm run deployed` and wait for its answer. It says when the site shows this change, or what failed.';

export const isMainBranch = () => git('rev-parse', '--abbrev-ref', 'HEAD').output === MAIN_BRANCH;

export function requireMainBranch() {
  if (!isMainBranch()) stop('This only works on the main branch. Switch to it with `git switch main`, bring your work over, and try again.');
}

export const worktreeIsClean = () => git('status', '--porcelain').output === '';

/** Fetches main from GitHub; false when GitHub cannot be reached. */
export const fetchMain = () => git('fetch', 'origin', MAIN_BRANCH).status === 0;

export function fetchMainOrStop() {
  if (!fetchMain()) stop('Could not reach GitHub, so nothing was done. Check the internet connection and try again.');
}

const countCommits = (range) => Number(git('rev-list', '--count', range).output);

export const commitsAheadOfMain = () => countCommits(`origin/${MAIN_BRANCH}..HEAD`);

export const commitsBehindMain = () => countCommits(`HEAD..origin/${MAIN_BRANCH}`);

export function sendToTry() {
  const pushed = git('push', '--force', 'origin', `HEAD:refs/heads/${TRY_BRANCH}`);
  if (pushed.status !== 0) stop(`The change is saved on this computer but sending it failed:\n${pushed.output}\nAsk the maintainer for help.`);
  console.log(`\n${SENT_NOTE}`);
}
