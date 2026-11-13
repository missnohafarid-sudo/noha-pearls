import { useEffect, useRef } from 'react';
import { PearlPanel } from './PearlPanel';
import { PearlToggle } from './PearlToggle';

type PanelProps = Parameters<typeof PearlPanel>[0];

interface Props extends Omit<PanelProps, 'onClose'> {
  open: boolean;
  /** How many have not answered the question on screen. */
  waiting: number;
  onToggle: () => void;
}

/** The pearl button in the stage's end-side bottom corner and the panel it opens over the slide; closing the panel puts focus back on the pearl. */
export function PearlCorner({ open, waiting, onToggle, ...panel }: Props) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) toggleRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      {open && <PearlPanel {...panel} onClose={onToggle} />}
      <PearlToggle ref={toggleRef} open={open} waiting={waiting} onToggle={onToggle} />
    </>
  );
}
