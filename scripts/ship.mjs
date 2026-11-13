// `npm run ship -- "message"`: quick check, then send the whole change as ONE commit on top of main to the online check.
// The online check puts it into main when it passes. The only way finished work leaves this computer.
import { git, npm, stop } from './lib/process.mjs';
import { commitsAheadOfMain, commitsBehindMain, fetchMainOrStop, requireMainBranch, sendToTry, worktreeIsClean } from './lib/shipping.mjs';

const MAX_MESSAGE_LENGTH = 65;
const NOTHING_TO_SHIP = 'There is nothing to ship: no file has changed since the site\'s last version.';

function checkedMessage(words) {
  const message = words.join(' ').trim();
  const advice = `Write one short line in the imperative, like "Add a heart to the board" (at most ${MAX_MESSAGE_LENGTH} characters), and run: npm run ship -- "your message"`;
  if (message === '') stop(`No commit message was given. ${advice}`);
  if (message.length > MAX_MESSAGE_LENGTH) stop(`The message is ${message.length} characters long; the limit is ${MAX_MESSAGE_LENGTH}. ${advice}`);
  if (/[\r\n]/.test(message)) stop(`The message must be a single line. ${advice}`);
  if (/^\w+(ed|ing)\b/i.test(message) || /[.!]$/.test(message)) stop(`Start with a verb in the imperative ("Add", "Fix", "Change") and end without a full stop. ${advice}`);
  return message;
}

const message = checkedMessage(process.argv.slice(2));

requireMainBranch();
fetchMainOrStop();
if (worktreeIsClean() && commitsAheadOfMain() === 0) stop(NOTHING_TO_SHIP);

if (npm('run', 'check:quick').status !== 0) stop('NOT SHIPPED: the quick check failed. Fix what it says, then ship again.');

if (!worktreeIsClean() && (git('add', '-A').status !== 0 || git('commit', '-m', message).status !== 0)) stop('NOT SHIPPED: git could not make the commit.');

if (commitsBehindMain() > 0 && git('rebase', 'origin/main').status !== 0) {
  git('rebase', '--abort');
  stop('NOT SHIPPED: the same lines were changed somewhere else in the meantime, so the two versions cannot be joined automatically. Your change is safe on this computer. The maintainer is needed.');
}

if (git('reset', '--soft', 'origin/main').status !== 0) stop('NOT SHIPPED: git could not gather the change into one commit.');
if (git('diff', '--cached', '--quiet').status === 0) stop(NOTHING_TO_SHIP);
if (git('commit', '-m', message).status !== 0) stop('NOT SHIPPED: git could not make the commit.');

sendToTry();
