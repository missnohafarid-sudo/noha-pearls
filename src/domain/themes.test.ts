import { describe, expect, it } from 'vitest';
import { PEARL_SHADES } from './pearlShades';
import { DEFAULT_THEME, THEMES, themeOf } from './themes';

describe('the looks of the site', () => {
  it('are the seven pearl shades, and the default is the first', () => {
    expect(THEMES).toEqual(PEARL_SHADES);
    expect(DEFAULT_THEME).toBe('white');
    expect(THEMES).toContain(DEFAULT_THEME);
  });

  it('show the look a site record names', () => {
    expect(themeOf({ theme: 'purple' })).toBe('purple');
  });

  it('show the default for no record, no look, or a look that no longer exists', () => {
    expect(themeOf(null)).toBe(DEFAULT_THEME);
    expect(themeOf(undefined)).toBe(DEFAULT_THEME);
    expect(themeOf({})).toBe(DEFAULT_THEME);
    expect(themeOf({ theme: 'teal' })).toBe(DEFAULT_THEME);
  });
});
