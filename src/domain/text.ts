/** The single home for how typed text is cleaned: names, messages and answers. */

/** The longest message the teacher can send to the groups. */
export const MAX_MESSAGE_LENGTH = 300;

/** The text without surrounding blanks and cut to `maxLength`; null when nothing is left. */
export function cleanText(raw: string, maxLength = Infinity): string | null {
  const trimmed = raw.trim().slice(0, maxLength);
  return trimmed === '' ? null : trimmed;
}

/** A name for a class, group, student or teacher; null when it is blank. */
export function cleanName(raw: string): string | null {
  return cleanText(raw);
}

export function cleanMessage(raw: string): string | null {
  return cleanText(raw, MAX_MESSAGE_LENGTH);
}
