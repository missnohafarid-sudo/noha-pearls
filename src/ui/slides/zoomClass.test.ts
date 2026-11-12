import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDF_ZOOM_STEPS } from '../../domain/media';
import { zoomClassName } from './zoomClass';

const css = readFileSync(new URL('./media.css', import.meta.url), 'utf8');

describe('the PDF zoom classes', () => {
  it('have one rule per zoom step, and the rule holds that step as a factor', () => {
    for (const step of PDF_ZOOM_STEPS) {
      const rule = new RegExp(`\\.${zoomClassName(step)}\\s*\\{\\s*--media-zoom:\\s*([\\d.]+);`).exec(css);
      expect(rule, `a rule for ${zoomClassName(step)}`).not.toBeNull();
      expect(Number(rule?.[1])).toBeCloseTo(step / 100);
    }
  });

  it('have no rule for a step that no longer exists', () => {
    const named = [...css.matchAll(/\.media-zoom-(\d+)\s*\{/g)].map((match) => Number(match[1]));
    expect(named.sort((a, b) => a - b)).toEqual([...PDF_ZOOM_STEPS].sort((a, b) => a - b));
  });
});
