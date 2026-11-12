/*
 * Rebuilds src/infrastructure/vendor/aruco.mjs from the js-aruco2 package.
 *
 * js-aruco2 publishes itself by assigning to `this`, which only works when a
 * loader treats it as CommonJS; the dev server, the production bundler and Node
 * each decide that differently (the bundler turns that `this` into undefined).
 * Bundling it once into a plain ES module, with those assignments rewritten to
 * `exports`, removes the guesswork. Run `npm run vendor:aruco` after upgrading
 * js-aruco2; the codec test fails if the rewrite ever stops matching.
 */
import { build } from 'vite';

/** Rewrites the library's top-level `this.X` (its export idiom) to `exports.X`. */
const exportViaExports = {
  name: 'js-aruco2-exports',
  transform(code, id) {
    if (!id.includes('/js-aruco2/')) return null;
    return code.replace(/^(var \w+ = )?this\.(\w+)/gm, '$1exports.$2');
  },
};

await build({
  configFile: false,
  logLevel: 'warn',
  plugins: [exportViaExports],
  build: {
    lib: { entry: 'scripts/aruco-entry.cjs', formats: ['es'], fileName: () => 'aruco.mjs' },
    outDir: 'src/infrastructure/vendor',
    emptyOutDir: false,
    minify: false,
  },
});
