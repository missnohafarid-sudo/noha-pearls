import type { ReactNode } from 'react';
import type { Verdict } from '../../domain/scoring';

const VERDICT_CLASS: Record<Verdict | 'none', string> = {
  correct: 'chip chip--ok',
  wrong: 'chip chip--bad',
  recorded: 'chip',
  pending: 'muted',
  none: 'muted',
};

interface VerdictChipProps {
  verdict: Verdict | 'none';
  ariaLabel?: string;
  children: ReactNode;
}

/** The one place a verdict becomes a style. */
export function VerdictChip({ verdict, ariaLabel, children }: VerdictChipProps) {
  return (
    <span className={VERDICT_CLASS[verdict]} aria-label={ariaLabel}>
      {children}
    </span>
  );
}
