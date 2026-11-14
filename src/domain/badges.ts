import { isRecord } from './argumentChecks';
import { isPearlShade, type PearlShade } from './pearlShades';
import type { SlideBadge } from './lessonModels';
import type { IssueReporter, RawSlide } from './slideFile';
import { isAbsent } from './slideFields';

/** The extra coloured badges a slide may carry beside its tag: the limit, the starting colour and how they are read, repaired and written. */

export const MAX_BADGES = 6;
export const DEFAULT_BADGE_COLOR: PearlShade = 'purple';

export function blankBadge(): SlideBadge {
  return { text: '', color: DEFAULT_BADGE_COLOR };
}

const colorOf = (value: unknown): PearlShade => (isPearlShade(value) ? value : DEFAULT_BADGE_COLOR);

/** Badges as stored: absent on slides saved before they existed; only well-formed entries are kept and an unknown colour becomes the default. */
export function storedBadges(stored: unknown): SlideBadge[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.text === 'string' ? [{ text: entry.text, color: colorOf(entry.color) }] : [],
  );
}

/** Badges from a lesson file: absent means none; a list of at most MAX_BADGES objects with a text and a known colour (or none) is read, anything else is reported. */
export function badgesOf(raw: RawSlide, report: IssueReporter): SlideBadge[] {
  const value = raw.badges;
  if (isAbsent(value)) return [];
  const wellFormed =
    Array.isArray(value) &&
    value.length <= MAX_BADGES &&
    value.every((entry: unknown) => isRecord(entry) && typeof entry.text === 'string' && (isAbsent(entry.color) || isPearlShade(entry.color)));
  if (!wellFormed) {
    report('bad-badges', 'badges');
    return [];
  }
  return keptBadges(storedBadges(value).map((badge) => ({ ...badge, text: badge.text.trim() })));
}

/** The badges as written to a file and as drawn (one rule for both): trimmed, blank ones dropped (the editor keeps a blank row while she types). */
export function keptBadges(badges: readonly SlideBadge[]): SlideBadge[] {
  return badges.flatMap(({ text, color }) => (text.trim() === '' ? [] : [{ text: text.trim(), color }]));
}
