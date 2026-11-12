/** The interface is Arabic, so numbers may be typed with Arabic-Indic or Eastern Arabic-Indic digits. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) & 15));
}
