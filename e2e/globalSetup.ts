import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, preview, type PreviewServer } from 'vite';
import type { TestProject } from 'vitest/node';
import { adminBuildVariables } from './testAdmin';

declare module 'vitest' {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

const HOST = '127.0.0.1';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Builds the production site with the test sign-in baked in, and serves it for the walkthrough.
 * Each run builds into a folder of its own: two runs at once must not overwrite the site the other is serving.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  Object.assign(process.env, adminBuildVariables());
  const outDir = mkdtempSync(join(tmpdir(), 'noha-pearls-e2e-'));
  await build({ logLevel: 'warn', mode: 'production', build: { outDir, emptyOutDir: true } });
  const port = await freePort();
  const server: PreviewServer = await preview({ logLevel: 'warn', build: { outDir }, preview: { host: HOST, port, strictPort: true } });
  project.provide('baseUrl', `http://${HOST}:${port}/`);
  return async () => {
    await server.close();
    rmSync(outDir, { recursive: true, force: true });
  };
}
