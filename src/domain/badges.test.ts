import { describe, expect, it } from 'vitest';
import { badgesOf, blankBadge, DEFAULT_BADGE_COLOR, keptBadges, MAX_BADGES, storedBadges } from './badges';
import { isPearlShade, PEARL_SHADES } from './pearlShades';
import type { IssueCode } from './slideFile';

const read = (badges: unknown) => {
  const issues: [IssueCode, string | null][] = [];
  const list = badgesOf({ badges }, (code, field) => issues.push([code, field]));
  return { list, issues };
};
const BAD: [IssueCode, string | null][] = [['bad-badges', 'badges']];

describe('the pearl shades', () => {
  it('are the seven of the brand, in order, and only those are known', () => {
    expect(PEARL_SHADES).toEqual(['white', 'cream', 'pink', 'gold', 'purple', 'brown', 'black']);
    expect(PEARL_SHADES.every(isPearlShade)).toBe(true);
    expect([isPearlShade('teal'), isPearlShade(3), isPearlShade(null)]).toEqual([false, false, false]);
  });
});

describe('badges', () => {
  it('start blank in the default colour', () => {
    expect(blankBadge()).toEqual({ text: '', color: DEFAULT_BADGE_COLOR });
    expect(DEFAULT_BADGE_COLOR).toBe('purple');
  });

  it('mean none when a file leaves them out or gives null', () => {
    expect(read(undefined)).toEqual({ list: [], issues: [] });
    expect(read(null)).toEqual({ list: [], issues: [] });
  });

  it('are read from a file, trimmed, blank texts dropped, an absent colour made the default', () => {
    const { list, issues } = read([{ text: ' أ ', color: 'gold' }, { text: '   ', color: 'pink' }, { text: 'ب' }]);
    expect(list).toEqual([{ text: 'أ', color: 'gold' }, { text: 'ب', color: DEFAULT_BADGE_COLOR }]);
    expect(issues).toEqual([]);
  });

  it('are reported and dropped when not a list, too many, a bad entry or an unknown colour', () => {
    const many = Array.from({ length: MAX_BADGES + 1 }, () => ({ text: 'x', color: 'gold' }));
    for (const bad of ['x', {}, many, ['x'], [null], [{ text: 3 }], [{ color: 'gold' }], [{ text: 'a', color: 'teal' }]]) {
      expect(read(bad)).toEqual({ list: [], issues: BAD });
    }
    expect(read(many.slice(0, MAX_BADGES)).issues).toEqual([]);
  });

  it('are repaired when stored: none before they existed, only well-formed entries, an unknown colour made the default', () => {
    expect(storedBadges(undefined)).toEqual([]);
    expect(storedBadges('x')).toEqual([]);
    expect(storedBadges([{ text: 'a', color: 'teal' }, { text: 5 }, null, { text: '', color: 'cream' }])).toEqual([
      { text: 'a', color: DEFAULT_BADGE_COLOR },
      { text: '', color: 'cream' },
    ]);
  });

  it('are written and drawn trimmed with blank texts dropped', () => {
    expect(keptBadges([{ text: ' a ', color: 'pink' }, { text: '  ', color: 'gold' }])).toEqual([{ text: 'a', color: 'pink' }]);
  });
});
