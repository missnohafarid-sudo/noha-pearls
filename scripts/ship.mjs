// `npm run ship -- "message"`: check, then commit and push everything. The only way finished work leaves this computer.
import { git, npm, stop } from './lib/process.mjs';

const MAX_MESSAGE_LENGTH = 65;
const PUBLISH_NOTE = 'Shipped. NEXT: run `npm run deployed` and wait for its answer. It says when the site shows this change, or that the online check failed.';

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

if (git('rev-parse', '--abbrev-ref', 'HEAD').output !== 'main') stop('Shipping is only allowed from the main branch. Switch to it with `git switch main`, bring your work over, and try again.');
if (git('status', '--porcelain').output === '') stop('There is nothing to ship: no file has changed since the last commit.');

if (npm('run', 'check').status !== 0) stop('NOT SHIPPED: the check failed. Fix what it says, then ship again.');

if (git('add', '-A').status !== 0 || git('commit', '-m', message).status !== 0) stop('NOT SHIPPED: git could not make the commit.');
process.env.CHECKED_COMMIT = git('rev-parse', 'HEAD').output;
const pushed = git('push');
if (pushed.status !== 0) stop(`The change is committed on this computer but the push failed:\n${pushed.output}\nAsk the maintainer for help; do not try to force it.`);
console.log(`\n${PUBLISH_NOTE}`);
