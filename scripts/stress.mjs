// `npm run test:stress`: loops a cross-tab change many times (STRESS_ITERATIONS, default 200). Not part of the check.
import { npm } from './lib/process.mjs';

process.env.E2E_STRESS = '1';
process.exit(npm('run', 'test:e2e').status);
