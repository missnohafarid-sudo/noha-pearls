/** The brand's seven pearls, in order; position i is the CSS token `--pearl-(i+1)`. */
export const PEARL_SHADES = ['white', 'cream', 'pink', 'gold', 'purple', 'brown', 'black'] as const;

export type PearlShade = (typeof PEARL_SHADES)[number];

export function isPearlShade(value: unknown): value is PearlShade {
  return PEARL_SHADES.includes(value as PearlShade);
}
