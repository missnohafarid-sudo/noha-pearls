// Protected files: fingerprints of the files that guard the project, and the maintainer key that may renew them.
// Commands: verify | init | accept   (see .guard/protected.json for what is protected)
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { stop } from './lib/process.mjs';
import { isProtectedPath } from './lib/protected.mjs';

const KEY_FILE = '.guard/key.sha256';
const MANIFEST_FILE = '.guard/manifest.json';
const MIN_KEY_LENGTH = 12;
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'dist']);
const SCRIPTS_ENTRY = 'package.json#scripts';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function listFiles(folder = '') {
  return readdirSync(folder || '.', { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(folder, entry.name);
    if (entry.isDirectory()) return SKIPPED_FOLDERS.has(entry.name) ? [] : listFiles(path);
    return [path];
  });
}

/** path -> fingerprint, for every protected file plus the `scripts` section of package.json. */
function fingerprints() {
  const prints = Object.fromEntries(listFiles().filter(isProtectedPath).sort().map((path) => [path, sha256(readFileSync(path))]));
  prints[SCRIPTS_ENTRY] = sha256(JSON.stringify(readJson('package.json').scripts ?? {}));
  return prints;
}

function differences(expected, actual) {
  const paths = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...paths].sort().flatMap((path) => {
    if (!(path in actual)) return [`removed: ${path}`];
    if (!(path in expected)) return [`added:   ${path}`];
    return expected[path] === actual[path] ? [] : [`changed: ${path}`];
  });
}

function verify() {
  if (!existsSync(KEY_FILE)) {
    console.log('Warning: the protected-files guard is not set up yet (no maintainer key). Run `npm run guard:init` once.');
    return;
  }
  if (!existsSync(MANIFEST_FILE)) stop(`The guard list ${MANIFEST_FILE} is missing. Restore it; only the maintainer may rebuild it with \`npm run guard:accept\`.`);
  const found = differences(readJson(MANIFEST_FILE), fingerprints());
  if (found.length > 0) {
    stop(`${found.join('\n')}\n\nThese files protect the project. Undo your changes to them. Only the maintainer may change them, with \`npm run guard:accept\`.`);
  }
  console.log('Protected files are unchanged.');
}

async function askKey(question) {
  if (process.env.MAINTAINER_KEY) return process.env.MAINTAINER_KEY;
  process.stdout.write(question);
  const hidden = new Writable({ write: (_chunk, _encoding, done) => done() });
  const reader = createInterface({ input: process.stdin, output: hidden, terminal: Boolean(process.stdin.isTTY) });
  const answer = await reader.question('');
  reader.close();
  process.stdout.write('\n');
  return answer;
}

const writeManifest = () => writeFileSync(MANIFEST_FILE, `${JSON.stringify(fingerprints(), null, 2)}\n`);

async function init() {
  if (existsSync(KEY_FILE)) stop('The guard already has a maintainer key. Use `npm run guard:accept` to renew the fingerprints.');
  const key = await askKey(`Choose a maintainer key (at least ${MIN_KEY_LENGTH} characters; keep it secret): `);
  if (key.length < MIN_KEY_LENGTH) stop(`That key is too short. Use at least ${MIN_KEY_LENGTH} characters.`);
  writeFileSync(KEY_FILE, `${sha256(key)}\n`);
  writeManifest();
  console.log('The guard is set up. Commit .guard/key.sha256 and .guard/manifest.json.');
}

async function accept() {
  if (!existsSync(KEY_FILE)) stop('The guard is not set up yet. Run `npm run guard:init` first.');
  const given = Buffer.from(sha256(await askKey('Maintainer key: ')));
  const stored = Buffer.from(readFileSync(KEY_FILE, 'utf8').trim());
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) stop('That is not the maintainer key. Nothing was accepted; undo your changes to the protected files.');
  writeManifest();
  console.log('The changes to the protected files are accepted and the fingerprints are renewed.');
}

const COMMANDS = { verify, init, accept };
const command = COMMANDS[process.argv[2]];
if (!command) stop('Use one of: verify, init, accept.');
await command();
