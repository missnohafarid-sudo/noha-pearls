// `npm run check`: everything that must pass before a change may reach main (the online check runs it).
// `npm run check:quick` (this script with `quick`): only the fast stages, which is all the teacher's computer runs. Stops at the first failure.
import { npm, stop } from './lib/process.mjs';

const STAGES = [
  { name: 'type check', args: ['run', 'typecheck'], quick: true },
  { name: 'unit tests and architecture rules', args: ['test'] },
  { name: 'protected files', args: ['run', 'guard:verify'], quick: true },
  { name: 'local server (site, hub, live socket, restart)', args: ['run', 'test:server'] },
  { name: 'browser walkthrough', args: ['run', 'test:e2e'] },
];

const stages = process.argv[2] === 'quick' ? STAGES.filter((stage) => stage.quick) : STAGES;

stages.forEach((stage, index) => {
  console.log(`\n=== Check ${index + 1} of ${stages.length}: ${stage.name} ===`);
  if (npm(...stage.args).status !== 0) {
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error title=Check failed::The "${stage.name}" stage of the check failed.`);
    stop(`STOPPED: the "${stage.name}" check failed. This change must not be shipped. Read the messages above, fix what they say, and try again.`);
  }
});

console.log('\nAll checks passed.');
