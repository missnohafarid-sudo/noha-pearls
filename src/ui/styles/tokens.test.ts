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
  ['accent', 'blush-deep'],
  ['rose-ink', 'bg'],
  ['on-accent', 'rose-ink'],
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
    if (!head.split(',').some((part) => part.trim() === selector)) continue;
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

const MIX = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/;
const VAR = /^var\(--([\w-]+)\)$/;

function mixed(first: string, share: number, second: string): string {
  const parts = [1, 3, 5].map((from) => Math.round((parseInt(first.slice(from, from + 2), 16) * share + parseInt(second.slice(from, from + 2), 16) * (100 - share)) / 100));
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

/** A token's colour as a six-digit hex: a literal, another token, or a two-colour sRGB mix of those. */
function hexOf(tokens: Map<string, string>, name: string, look: string): string {
  const resolve = (value: string | undefined): string => {
    const text = value ?? '';
    if (/^#[0-9a-f]{6}$/i.test(text)) return text;
    const reference = VAR.exec(text);
    if (reference) return resolve(tokens.get(reference[1]));
    const mix = MIX.exec(text);
    if (mix) return mixed(resolve(mix[1]), Number(mix[2]), resolve(mix[3]));
    throw new Error(`--${name} is not a colour in the "${look}" look: ${value}`);
  };
  return resolve(tokens.get(name));
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
