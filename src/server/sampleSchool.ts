/** Only a hub on this computer is given the variable (`vite.config.ts`, `e2e/serverProcess.ts`); a deployed hub has none, so a real school starts with no invented people. */
export const wantsSampleSchool = (env: { SAMPLE_SCHOOL?: unknown }): boolean => env.SAMPLE_SCHOOL === '1';
