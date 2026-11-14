import { createContext, useContext } from 'react';

/**
 * Who decides whether a hidden part of the slide on screen is open: the part's position (see `hiddenPartCount`) is asked.
 * `toggle` is absent where a part may not be pressed, so it is drawn without a button.
 */
export interface HiddenControl {
  isOpen(part: number): boolean;
  toggle: ((part: number) => void) | null;
}

/** Every part open with nothing to press: inside an open part, and on a student's device, where each part present is one the teacher opened. */
export const SHOWN: HiddenControl = { isOpen: () => true, toggle: null };

const HiddenControlContext = createContext<HiddenControl | null>(null);

export const HiddenControlProvider = HiddenControlContext.Provider;

/** Null where each hidden part keeps its own state and button. */
export function useHiddenControl(): HiddenControl | null {
  return useContext(HiddenControlContext);
}
