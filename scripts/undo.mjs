// `npm run undo`: takes back the last shipped change by committing its opposite, and ships that.
import { git, npm, stop } from './lib/process.mjs';

if (git('status', '--porcelain').output !== '') stop('There are unshipped changes in this folder, so undoing is not safe. Ship them first (`npm run ship -- "message"`) or ask the maintainer to discard them.');

const reverted = git('revert', '--no-edit', 'HEAD');
if (reverted.status !== 0) stop(`git could not undo the last change:\n${reverted.output}`);

if (npm('run', 'check').status !== 0) stop('NOT PUSHED: the check failed after the undo. The undo is saved on this computer only. Ask the maintainer for help.');

const pushed = git('push');
if (pushed.status !== 0) stop(`The undo is committed on this computer but the push failed:\n${pushed.output}\nAsk the maintainer for help; do not try to force it.`);
console.log('\nThe last change is undone. The site updates itself in a few minutes, once the online check passes.');
