// `npm run check`: everything that must pass before a change may leave this computer. Stops at the first failure.
import { npm, stop } from './lib/process.mjs';

const STAGES = [
  { name: 'type check', args: ['run', 'typecheck'] },
  { name: 'unit tests and architecture rules', args: ['test'] },
  { name: 'protected files', args: ['run', 'guard:verify'] },
  { name: 'local server (site, hub, live socket, restart)', args: ['run', 'test:server'] },
  { name: 'browser walkthrough', args: ['run', 'test:e2e'] },
];

STAGES.forEach((stage, index) => {
  console.log(`\n=== Check ${index + 1} of ${STAGES.length}: ${stage.name} ===`);
  if (npm(...stage.args).status !== 0) {
    stop(`STOPPED: the "${stage.name}" check failed. This change must not be shipped. Read the messages above, fix what they say, and try again.`);
  }
});

console.log('\nAll checks passed.');
