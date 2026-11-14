import { isPearlShade, PEARL_SHADES, type PearlShade } from './pearlShades';

/** The looks of the site are the brand's pearl shades, one look per pearl. */
export const THEMES = PEARL_SHADES;

export type Theme = PearlShade;

export const DEFAULT_THEME: Theme = 'white';

/** The look to show for a site record: the one it names, or the default when it names none or one that no longer exists. */
export function themeOf(site: { theme?: string } | null | undefined): Theme {
  return isPearlShade(site?.theme) ? site.theme : DEFAULT_THEME;
}

/**
 * The look to show right now: the site record's once it has arrived (`null` is a record that does not exist, `undefined` one still on its way);
 * until then the look this device remembered, if that still names a look, else the default.
 */
export function lookToShow(site: { theme?: string } | null | undefined, remembered: string | null): Theme {
  if (site !== undefined) return themeOf(site);
  return isPearlShade(remembered) ? remembered : DEFAULT_THEME;
}
