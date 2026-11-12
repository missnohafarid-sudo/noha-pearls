import { useState, type KeyboardEvent } from 'react';
import { toAsciiDigits } from '../../domain/digits';

interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** Names the number. */
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
}

/** A whole number with minus and plus beside it. It can also be typed; a number in range is passed on as it is typed, and one out of range becomes the nearest bound when she leaves the field. */
export function Stepper({ value, min = -Infinity, max = Infinity, onChange, label, decreaseLabel, increaseLabel }: StepperProps) {
  const [typing, setTyping] = useState<string | null>(null);

  const nearestInRange = (typed: number) => Math.min(max, Math.max(min, typed));

  const settle = () => {
    const text = toAsciiDigits(typing ?? '').trim();
    setTyping(null);
    if (!/^-?\d+$/.test(text)) return;
    const typed = Number(text);
    const bounded = nearestInRange(typed);
    if (bounded !== typed && bounded !== value) onChange(bounded);
  };

  const go = (next: number) => {
    setTyping(null);
    if (next >= min && next <= max) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    go(value + (event.key === 'ArrowUp' ? 1 : -1));
  };

  return (
    <span className="stepper">
      <button type="button" className="btn btn--small stepper__button" aria-label={decreaseLabel} disabled={value <= min} onClick={() => go(value - 1)}>
        −
      </button>
      <input
        className="input stepper__input"
        role="spinbutton"
        inputMode="numeric"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        value={typing ?? String(value)}
        onBlur={settle}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          const text = toAsciiDigits(event.target.value).trim();
          setTyping(event.target.value);
          if (/^-?\d+$/.test(text)) {
            const typed = Number(text);
            if (typed >= min && typed <= max) onChange(typed);
          }
        }}
      />
      <button type="button" className="btn btn--small stepper__button" aria-label={increaseLabel} disabled={value >= max} onClick={() => go(value + 1)}>
        +
      </button>
    </span>
  );
}
