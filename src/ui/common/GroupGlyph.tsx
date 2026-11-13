/** A small drawn mark of a group of people, in the colour of the text around it. */
export function GroupGlyph() {
  return (
    <svg className="group-glyph" viewBox="0 0 16 12" aria-hidden="true" focusable="false">
      <circle cx="4" cy="3.5" r="2" />
      <circle cx="12" cy="3.5" r="2" />
      <circle cx="8" cy="5.5" r="2.4" />
      <path d="M0.5 11c0-2.2 1.6-3.5 3.5-3.5S7.5 8.8 7.5 11zM8.5 11c0-2.2 1.6-3.5 3.5-3.5s3.5 1.3 3.5 3.5z" />
    </svg>
  );
}
