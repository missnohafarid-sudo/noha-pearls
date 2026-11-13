import { useState } from 'react';
import type { Id } from '../../../domain/models';

/** Whether the pearl panel is open and which tab it shows (a group's id, or null for the overview); both outlive the panel, so it reopens where it was left. */
export function usePearlPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Id | null>(null);
  return {
    open,
    tab,
    select: setTab,
    toggle: () => setOpen((was) => !was),
    openOnOverview: () => {
      setTab(null);
      setOpen(true);
    },
  };
}
