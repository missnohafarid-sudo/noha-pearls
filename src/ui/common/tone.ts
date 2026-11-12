import type { CSSProperties } from 'react';

/** Passes a group's colour to CSS as `--tone` (used by `.card--tone`, `.bar__fill`, …). */
export function toneStyle(color: string): CSSProperties {
  return { '--tone': color } as CSSProperties;
}
