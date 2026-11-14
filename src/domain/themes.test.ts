import { describe, expect, it } from 'vitest';
import { PEARL_SHADES } from './pearlShades';
import { DEFAULT_THEME, lookToShow, THEMES, themeOf } from './themes';

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

describe('the look shown before and after the site record arrives', () => {
  it('is the remembered look while the record is on its way', () => {
    expect(lookToShow(undefined, 'black')).toBe('black');
  });

  it('is the default while the record is on its way and nothing, or a look that no longer exists, is remembered', () => {
    expect(lookToShow(undefined, null)).toBe(DEFAULT_THEME);
    expect(lookToShow(undefined, 'teal')).toBe(DEFAULT_THEME);
  });

  it('is the record\'s once it has arrived, whatever was remembered', () => {
    expect(lookToShow({ theme: 'purple' }, 'black')).toBe('purple');
    expect(lookToShow({}, 'black')).toBe(DEFAULT_THEME);
    expect(lookToShow(null, 'black')).toBe(DEFAULT_THEME);
  });
});
