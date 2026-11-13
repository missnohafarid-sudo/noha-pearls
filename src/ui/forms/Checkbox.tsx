interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** The full name for a screen reader, while the check box shows a short word. */
  ariaLabel?: string;
}

/** Our own drawn check box. The real check box stays in the page, hidden from the eye only, so keyboards and screen readers keep it. */
export function Checkbox({ checked, onChange, label, ariaLabel }: CheckboxProps) {
  return (
    <label className="checkbox">
      <input className="checkbox__input visually-hidden" type="checkbox" aria-label={ariaLabel} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="checkbox__box" aria-hidden="true" />
      <span className="field__label">{label}</span>
    </label>
  );
}
