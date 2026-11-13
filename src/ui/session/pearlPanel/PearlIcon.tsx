/** A small drawn pearl: its body takes the text colour, with a soft rose-gold rim and a highlight. */
export function PearlIcon() {
  return (
    <svg className="pearl-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle className="pearl-icon__body" cx="12" cy="12.5" r="8.5" />
      <circle className="pearl-icon__rim" cx="12" cy="12.5" r="8.5" />
      <ellipse className="pearl-icon__shine" cx="9" cy="9.2" rx="3" ry="1.8" transform="rotate(-35 9 9.2)" />
    </svg>
  );
}
