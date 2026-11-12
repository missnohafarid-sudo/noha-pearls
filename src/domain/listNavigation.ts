/** How the keyboard moves through a list of options (a drop-down's list). Indexes are 0-based; -1 is "none". */

type MoveKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End' | 'PageDown' | 'PageUp';

const MOVE_KEYS: ReadonlySet<string> = new Set<MoveKey>(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']);
const PAGE = 10;

export function isMoveKey(key: string): key is MoveKey {
  return MOVE_KEYS.has(key);
}

/** Where `key` takes the highlight from `current` in a list of `count` options; it stops at the ends. */
export function movedIndex(key: MoveKey, current: number, count: number): number {
  if (count === 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : key === 'PageDown' ? PAGE : -PAGE;
  return Math.min(count - 1, Math.max(0, current + step));
}

/** What a key does to a drop-down: the WAI-ARIA select-only combobox pattern, apart from typing letters. */
type ListKeyEffect = { type: 'none' } | { type: 'open'; index: number } | { type: 'move'; index: number } | { type: 'choose' } | { type: 'close' };

const NONE: ListKeyEffect = { type: 'none' };

/**
 * What `key` does when the list is `open` or closed. `selected` is the chosen option, `active` the highlighted one while open.
 * A closed list opens on Enter, Space and the arrows (on the chosen option, unmoved), and on Home and End (on the first and the last).
 * An open list moves on the move keys, chooses and closes on Enter, Space and Alt+ArrowUp, and closes on Escape and Tab.
 */
export function listKeyEffect(open: boolean, key: string, alt: boolean, selected: number, active: number, count: number): ListKeyEffect {
  if (!open) {
    if (alt) return key === 'ArrowDown' ? { type: 'open', index: Math.max(selected, 0) } : NONE;
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp') return { type: 'open', index: Math.max(selected, 0) };
    return key === 'Home' || key === 'End' ? { type: 'open', index: Math.max(movedIndex(key, selected, count), 0) } : NONE;
  }
  if (alt) return key === 'ArrowUp' ? { type: 'choose' } : NONE;
  if (key === 'Enter' || key === ' ') return { type: 'choose' };
  if (key === 'Escape' || key === 'Tab') return { type: 'close' };
  return isMoveKey(key) ? { type: 'move', index: movedIndex(key, active, count) } : NONE;
}

/**
 * The option a typed `query` jumps to: the first label starting with it, searching from `current` and wrapping.
 * One letter typed again and again steps through the options that start with it, so the search then starts after `current`.
 * Returns -1 when nothing starts with it.
 */
export function typeaheadIndex(labels: readonly string[], current: number, query: string): number {
  const wanted = query.toLowerCase();
  if (wanted === '' || labels.length === 0) return -1;
  const repeatedLetter = [...wanted].every((letter) => letter === wanted[0]);
  const prefix = repeatedLetter ? wanted[0] : wanted;
  const first = repeatedLetter ? current + 1 : current;
  for (let offset = 0; offset < labels.length; offset += 1) {
    const index = (((first + offset) % labels.length) + labels.length) % labels.length;
    if (labels[index].toLowerCase().startsWith(prefix)) return index;
  }
  return -1;
}
