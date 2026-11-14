import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../domain/themes';

const MIN_CONTRAST = 4.5;

/** Each pair is a text token on the token it is drawn over. */
const PAIRS: readonly (readonly [text: string, over: string])[] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['accent', 'accent-soft'],
  ['on-accent', 'accent'],
  ['gold-ink', 'gold-soft'],
  ['ok', 'ok-soft'],
  ['bad-ink', 'bad-soft'],
  ['info-ink', 'info-soft'],
  ['heart-ink', 'heart-soft'],
];

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function declarationsOf(selector: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, head, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (head.trim() !== selector) continue;
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) found.set(name, value.trim());
  }
  return found;
}

function lookTokens(look: string): Map<string, string> {
  const base = declarationsOf(':root');
  return look === 'white' ? base : new Map([...base, ...declarationsOf(`:root[data-theme='${look}']`)]);
}

function channel(hex: string, from: number): number {
  const value = parseInt(hex.slice(from, from + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function hexOf(tokens: Map<string, string>, name: string, look: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${name} is not a six-digit hex colour in the "${look}" look: ${value}`);
  return value;
}

describe('the looks of the site stay readable', () => {
  it.each(THEMES)('%s: every text colour is readable over what it is drawn on', (look) => {
    const tokens = lookTokens(look);
    for (const [text, over] of PAIRS) {
      const ratio = contrast(hexOf(tokens, text, look), hexOf(tokens, over, look));
      expect(ratio, `--${text} over --${over} in "${look}"`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('every look other than the default has its own block', () => {
    for (const look of THEMES.filter((name) => name !== 'white')) expect(declarationsOf(`:root[data-theme='${look}']`).size, look).toBeGreaterThan(0);
  });

  it('the seventh pearl is dark enough for its white shine to read', () => {
    const tokens = lookTokens('white');
    expect(contrast(hexOf(tokens, 'pearl-shine', 'white'), hexOf(tokens, 'pearl-7', 'white'))).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});
