// Runs after `npm install`: points git at the project's hooks. Does nothing when this folder is not a git repository.
import { git } from './lib/process.mjs';

if (git('rev-parse', '--git-dir').status === 0) git('config', 'core.hooksPath', '.githooks');
