// `npm run discard`: throws away everything in this folder that is not on the site.
// It also deletes files that were added and never shipped. For the teacher's agent when its change failed the online check three times, or when it must start over.
import { git, stop } from './lib/process.mjs';
import { fetchMainOrStop, requireMainBranch } from './lib/shipping.mjs';

requireMainBranch();
fetchMainOrStop();

for (const args of [['reset', '--hard', 'origin/main'], ['clean', '-fd']]) {
  const done = git(...args);
  if (done.status !== 0) stop(`git could not throw the change away:\n${done.output}`);
}
console.log('Thrown away. This folder now matches the site.');
