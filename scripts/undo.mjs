// `npm run undo`: takes back the last change of main by committing its opposite, and sends that to the online check.
import { git, stop } from './lib/process.mjs';
import { isProtectedPath } from './lib/protected.mjs';
import { commitsAheadOfMain, commitsBehindMain, fetchMainOrStop, requireMainBranch, sendToTry, worktreeIsClean } from './lib/shipping.mjs';

requireMainBranch();
fetchMainOrStop();

if (!worktreeIsClean() || commitsAheadOfMain() > 0) {
  stop('There is a change on this computer that is not on the site, so undoing is not safe. If it was shipped, run `npm run deployed` to see what became of it. Otherwise ship it (`npm run ship -- "message"`) or throw it away (`npm run discard`).');
}

if (commitsBehindMain() > 0) {
  const joined = git('merge', '--ff-only', 'origin/main');
  if (joined.status !== 0) stop(`git could not bring this computer up to date with the site:\n${joined.output}`);
  stop('This computer was behind the site and is now up to date. The newest change may not be the one you meant: read the log again (`git --no-pager log --oneline -5`), tell her which change is the last one, and run `npm run undo` again.');
}

const machinery = git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').output.split('\n').find(isProtectedPath);
if (machinery) stop(`The newest change on the site is the maintainer's: it changes the site's machinery (${machinery}), so it is not undone from here. To take back an earlier change, make it a new small change.`);

const reverted = git('revert', '--no-edit', 'HEAD');
if (reverted.status !== 0) stop(`git could not undo the last change:\n${reverted.output}`);

sendToTry();
