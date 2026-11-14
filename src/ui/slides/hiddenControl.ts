import { createContext, useContext } from 'react';

/**
 * Who decides whether a hidden part of the slide on screen is open: the part's position (see `hiddenPartCount`) is asked.
 * `toggle` is absent where a part may not be pressed, so it is drawn without a button.
 */
export interface HiddenControl {
  isOpen(part: number): boolean;
  toggle: ((part: number) => void) | null;
}

/** What stands inside an open part: shown as it is, with nothing to press. */
export const SHOWN: HiddenControl = { isOpen: () => true, toggle: null };

const HiddenControlContext = createContext<HiddenControl | null>(null);

export const HiddenControlProvider = HiddenControlContext.Provider;

/** Null where each hidden part keeps its own state and button. */
export function useHiddenControl(): HiddenControl | null {
  return useContext(HiddenControlContext);
}
