import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredLayer } from './useAnchoredLayer';

/** Explains what it wraps in a small bubble of our own, on hover and on focus (a tap focuses it on a phone). */
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const host = useAnchoredLayer(anchor, bubble, shown, false);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="tip"
        aria-describedby={id}
        onMouseEnter={() => setShown(true)}
        onMouseLeave={() => setShown(false)}
        onFocus={() => setShown(true)}
        onBlur={() => setShown(false)}
        onKeyDown={(event) => event.key === 'Escape' && setShown(false)}
      >
        {children}
      </button>
      {host &&
        createPortal(
          <span ref={bubble} id={id} role="tooltip" className="layer tip__bubble">
            {text}
          </span>,
          host,
        )}
    </>
  );
}
