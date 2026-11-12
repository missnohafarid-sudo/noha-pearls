import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

/**
 * The machine-enforced rules of the code base. Each rule is one entry of RULES (a pattern checked line by line)
 * or of FILE_RULES (a check that needs a whole file or the whole project). To add a rule, add an entry.
 * Test files are exempt from all rules: they may assemble real adapters, hold long cases and use any wording.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

interface SourceFile {
  path: string;
  lines: string[];
}

function listFiles(dir: string): string[] {
  return readdirSync(`${ROOT}${dir}`, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8');
/** Stylesheet comments are blanked (keeping line numbers) so a rule never fires on prose. */
const withoutCssComments = (path: string, text: string): string =>
  path.endsWith('.css') ? text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, '')) : text;
const ALL: SourceFile[] = listFiles('src').map((path) => ({ path, lines: withoutCssComments(path, read(path)).split('\n') }));

const isTest = (file: SourceFile) => file.path.endsWith('.test.ts');
const isCode = (file: SourceFile) => /\.tsx?$/.test(file.path) && !isTest(file);
const isCss = (file: SourceFile) => file.path.endsWith('.css');
const inside = (file: SourceFile, ...folders: string[]) => folders.some((folder) => file.path.startsWith(`src/${folder}/`) || file.path === `src/${folder}`);
const layerOf = (path: string): string => (path.split('/').length > 2 ? path.split('/')[1] : '(root)');

/** One line-by-line check: a violation is a line where `pattern` matches and `violates` (if given) agrees. */
interface Rule {
  name: string;
  applies: (file: SourceFile) => boolean;
  pattern: RegExp;
  /** Cleans a line before matching, e.g. to drop comments or text that is not a value. */
  sanitize?: (line: string) => string;
  violates?: (match: RegExpMatchArray, file: SourceFile) => boolean;
  message: (match: RegExpMatchArray, file: SourceFile) => string;
}

/** A check that looks at all the files at once and returns one message per violation. */
interface FileRule {
  name: string;
  find: () => string[];
}

// ---- 1. Layer imports ----------------------------------------------------------------------------------------

const LAYERS: Record<string, { may: string[]; hint: Record<string, string> }> = {
  domain: { may: ['domain'], hint: { '*': 'the domain holds pure rules and may import only the domain. Move what you need into src/domain, or pass it in as an argument.' } },
  ports: { may: ['domain', 'ports'], hint: { '*': 'ports are interfaces and may import only domain and ports. Put the implementation in src/infrastructure instead.' } },
  services: { may: ['domain', 'ports', 'services'], hint: { '*': 'services may import only domain, ports and services. Reach storage or other adapters through an interface in src/ports.' } },
  infrastructure: { may: ['domain', 'ports', 'infrastructure'], hint: { '*': 'adapters may import only domain, ports and infrastructure. Business rules belong in src/domain.' } },
  i18n: { may: ['domain', 'i18n'], hint: { '*': 'interface text may import only domain and i18n. Keep wording free of logic.' } },
  app: { may: ['domain', 'ports', 'services', 'infrastructure', 'i18n', 'app'], hint: { '*': 'src/app wires things together and may not import the interface. src/main.tsx mounts the interface.' } },
  ui: {
    may: ['ui', 'domain', 'services', 'ports', 'i18n'],
    hint: {
      infrastructure: 'the interface may not reach storage or adapters. Ask a service through useServices() instead.',
      app: 'the interface may import only src/app/config.ts from src/app. Put a new setting in src/app/config.ts, or ask a service through useServices().',
      '*': 'the interface may import only ui, domain, services, ports, i18n and src/app/config.ts.',
    },
  },
};
const UI_MAY_IMPORT_FILE = 'src/app/config';

const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/;

/** The project file (without extension) an import line points at; null for a library. */
function importTarget(match: RegExpMatchArray, file: SourceFile): string | null {
  const specifier = match[1];
  return specifier.startsWith('.') ? posix.join(posix.dirname(file.path), specifier).replace(/\.(tsx?|mjs|json|css)$/, '') : null;
}

function breaksLayers(match: RegExpMatchArray, file: SourceFile): boolean {
  const from = LAYERS[layerOf(file.path)];
  const target = importTarget(match, file);
  if (!from || target === null) return false;
  if (layerOf(file.path) === 'ui' && target === UI_MAY_IMPORT_FILE) return false;
  return !from.may.includes(layerOf(target)) && layerOf(target) !== '(root)';
}

// ---- 2, 3, 5: text, storage and stylesheet vocabulary -------------------------------------------------------

const ARABIC_LETTER = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const CODE_COMMENT = /\s\/\/.*$|^\s*(\/\*|\*).*$/;

const PHYSICAL_PROPERTY = /(?:^|[\s;{])(?:(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)(?:-[a-z]+)?|border-(?:top|bottom)-(?:left|right)-radius|left|right|float)\s*:/;
const PHYSICAL_VALUE = /:\s*[^;{}]*\b(?:left|right)\b/;
const HEX_COLOUR = /#[0-9a-fA-F]{3,8}\b/;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
const NAMED_COLOURS = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen';
const NAMED_COLOUR_VALUE = new RegExp(`:\\s*[^;{}]*\\b(?:${NAMED_COLOURS.split(' ').join('|')})\\b`, 'i');
/** Leaves only what a stylesheet declaration says: drops quoted text, urls and var(--token) references. */
const declarationOnly = (line: string): string =>
  line.replace(/"[^"]*"|'[^']*'/g, '""').replace(/url\([^)]*\)/g, '').replace(/var\([^)]*\)/g, '').replace(/--[\w-]+/g, '').replace(/^.*\{\s*$/, '');

const STORAGE_API = /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie|\bfetch\(/;

/** The only files that may inject generated markup; each draws an SVG made by our own code, never user text. */
const MARKUP_ALLOWED: Record<string, string> = {
  'src/ui/common/QrCode.tsx': 'draws the QR code SVG generated by the QR renderer',
  'src/ui/pages/CardsPage.tsx': 'draws the answer-card marker SVG generated by the card codec',
};

const RULES: Rule[] = [
  {
    name: '1. Layer imports: every folder may import only the folders its layer allows',
    applies: (file) => isCode(file) && layerOf(file.path) in LAYERS,
    pattern: IMPORT,
    violates: breaksLayers,
    message: (match, file) => {
      const target = importTarget(match, file) ?? '';
      const hints = LAYERS[layerOf(file.path)].hint;
      return `${file.path} imports ${target}: ${hints[layerOf(target)] ?? hints['*']}`;
    },
  },
  {
    name: '2. No Arabic text outside src/i18n and the seed data',
    applies: (file) => isCode(file) && !inside(file, 'i18n') && file.path !== 'src/app/seed.ts',
    pattern: ARABIC_LETTER,
    message: (_match, file) => `${file.path} contains Arabic text. Move the text to src/i18n/<feature>.ts and use t.<feature>.<key>.`,
  },
  {
    name: '3. No browser storage or network calls outside src/infrastructure and src/app',
    applies: (file) => isCode(file) && !inside(file, 'infrastructure', 'app'),
    pattern: STORAGE_API,
    sanitize: (line) => line.replace(CODE_COMMENT, ''),
    message: (match, file) => `${file.path} uses ${match[0]}. Storage and network code belongs in src/infrastructure behind an interface in src/ports; ask a service instead.`,
  },
  {
    name: '4. dangerouslySetInnerHTML only in the files that draw generated QR and marker SVG',
    applies: (file) => isCode(file) && !(file.path in MARKUP_ALLOWED),
    pattern: /dangerouslySetInnerHTML/,
    message: (_match, file) => `${file.path} uses dangerouslySetInnerHTML. Never inject markup. Render it with React elements; generated SVG is allowed only in ${Object.keys(MARKUP_ALLOWED).join(' and ')}.`,
  },
  {
    name: '5a. Stylesheets use logical properties, never left or right',
    applies: (file) => isCss(file) && file.path !== 'src/ui/pages/cards.css',
    pattern: new RegExp(`${PHYSICAL_PROPERTY.source}|${PHYSICAL_VALUE.source}`),
    sanitize: declarationOnly,
    message: (_match, file) => `${file.path} uses a physical direction (left, right, float). The interface is right-to-left: use margin-inline-start/end, padding-inline-start/end, inset-inline-start/end, text-align: start/end.`,
  },
  {
    name: '5b. Stylesheets use var(--token) colours, defined only in tokens.css',
    applies: (file) => isCss(file) && file.path !== 'src/ui/styles/tokens.css',
    pattern: new RegExp(`${HEX_COLOUR.source}|${COLOUR_FUNCTION.source}|${NAMED_COLOUR_VALUE.source}`, 'i'),
    sanitize: declarationOnly,
    message: (_match, file) => `${file.path} contains a colour value. Use a var(--…) design token from src/ui/styles/tokens.css; add the token there if it does not exist.`,
  },
  {
    name: '6. No inline style objects in components, except toneStyle(...) and a bar inlineSize',
    applies: (file) => isCode(file) && file.path.endsWith('.tsx'),
    pattern: /style=\{(?!\{\s*inlineSize\s*:)(?!(?!\{)[^}]*\btoneStyle\()/,
    message: (_match, file) => `${file.path} has an inline style. Put the look in a stylesheet class (src/ui/**/*.css); only style={toneStyle(...)} and a bar's style={{ inlineSize: ... }} are allowed.`,
  },
  {
    name: '7. The interface holds no rules: no sorting, summing or clock reading in src/ui',
    applies: (file) => isCode(file) && inside(file, 'ui'),
    pattern: /\.sort\(|\.reduce\(|new Date\(|Date\.now\(/,
    sanitize: (line) => line.replace(CODE_COMMENT, ''),
    message: (match, file) => `${file.path} uses ${match[0]}. Ranking, scoring, pacing and time rules belong in src/domain (or a service); the component should only show the result.`,
  },
];

function scan(rule: Rule): string[] {
  return ALL.filter(rule.applies).flatMap((file) =>
    file.lines.flatMap((line, index) => {
      const match = (rule.sanitize ? rule.sanitize(line) : line).match(rule.pattern);
      return match && (rule.violates?.(match, file) ?? true) ? [`${file.path}:${index + 1}: ${rule.message(match, file)}\n    the line is: ${line.trim().slice(0, 120)}`] : [];
    }),
  );
}

// ---- 8, 9, 10: whole-file and whole-project rules ------------------------------------------------------------

const MAX_LINES = 250;
const EXPORTS_FUNCTION = /^export\s+(?:async\s+)?function\b|^export\s+const\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>/m;

/** Adding a library needs the maintainer's approval: change this list only when she has given it. */
const ALLOWED_PACKAGES = {
  dependencies: ['qrcode-generator', 'react', 'react-dom'],
  devDependencies: ['@types/node', '@types/react', '@types/react-dom', '@vitejs/plugin-react', 'js-aruco2', 'puppeteer', 'typescript', 'vite', 'vitest'],
};

const FILE_RULES: FileRule[] = [
  {
    name: `8. No source file longer than ${MAX_LINES} lines`,
    find: () =>
      ALL.filter((file) => (isCode(file) || isCss(file)) && !inside(file, 'infrastructure/vendor', 'i18n') && file.lines.length > MAX_LINES).map(
        (file) => `${file.path} has ${file.lines.length} lines (the limit is ${MAX_LINES}). Split it by responsibility into smaller files.`,
      ),
  },
  {
    name: '9. Every src/domain file that exports a function is imported by a test',
    find: () => {
      const tested = new Set(
        ALL.filter(isTest).flatMap((test) => test.lines.flatMap((line) => importTarget(line.match(IMPORT) ?? ['', '#'], test) ?? [])),
      );
      return ALL.filter((file) => isCode(file) && inside(file, 'domain') && EXPORTS_FUNCTION.test(file.lines.join('\n')) && !tested.has(file.path.replace(/\.tsx?$/, ''))).map(
        (file) => `${file.path} exports functions but no test imports it. Add tests for it in src/domain/domain.test.ts, or in ${file.path.replace(/\.tsx?$/, '.test.ts')}.`,
      );
    },
  },
  {
    name: '10. package.json lists only approved libraries',
    find: () => {
      const manifest = JSON.parse(read('package.json')) as Record<string, Record<string, string> | undefined>;
      const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;
      return sections.flatMap((section) =>
        Object.keys(manifest[section] ?? {})
          .filter((name) => !((ALLOWED_PACKAGES as Record<string, string[]>)[section] ?? []).includes(name))
          .map((name) => `package.json ${section} lists "${name}". Adding a library needs the maintainer's approval: remove it, and ask the maintainer before using a new library.`),
      );
    },
  },
];

function expectNone(name: string, violations: string[]): void {
  if (violations.length > 0) throw new Error(`\nARCHITECTURE RULE BROKEN: ${name}\n${violations.join('\n')}\n`);
}

describe('architecture', () => {
  for (const rule of RULES) it(rule.name, () => expectNone(rule.name, scan(rule)));
  for (const rule of FILE_RULES) it(rule.name, () => expectNone(rule.name, rule.find()));
});
