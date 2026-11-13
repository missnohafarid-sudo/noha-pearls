// The one definition of a protected path, read from .guard/protected.json. Used by guard.mjs and undo.mjs.
import { readFileSync } from 'node:fs';

const CONFIG_FILE = '.guard/protected.json';

function globToRegExp(glob) {
  const source = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${source}$`);
}

const { patterns, exclude } = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
const protectedPatterns = patterns.map(globToRegExp);

/** Whether a path (relative to the project folder, with `/`) is one of the protected files. */
export const isProtectedPath = (path) => protectedPatterns.some((pattern) => pattern.test(path)) && !exclude.includes(path);
