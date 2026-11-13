import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** The walkthrough tests the page alone, so it sets this to leave the server out of its build and preview. */
export const SITE_ONLY_VARIABLE = 'NOHA_SITE_ONLY';

// `base: './'` plus hash routing lets the same build run from any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [react(), ...(process.env[SITE_ONLY_VARIABLE] || process.env.VITEST ? [] : [cloudflare()])],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
