import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';

interface FocusRequests {
  wanted: string | null;
  request: (key: string) => void;
  settle: () => void;
}

const FocusContext = createContext<FocusRequests | null>(null);

/** Remembers which named element should take focus next. Without it nothing moves focus. */
export function FocusProvider({ children }: { children: ReactNode }) {
  const [wanted, setWanted] = useState<string | null>(null);
  const settle = useCallback(() => setWanted(null), []);
  const value = useMemo<FocusRequests>(() => ({ wanted, request: setWanted, settle }), [wanted, settle]);
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

/** The ref of the element named `key` (none when `key` is null): it takes focus itself, on the render where it is on screen and asked for. */
export function useFocusTarget<T extends HTMLElement>(key: string | null): RefObject<T | null> {
  const requests = useContext(FocusContext);
  const ref = useRef<T | null>(null);
  const wanted = requests?.wanted ?? null;
  const settle = requests?.settle;
  useEffect(() => {
    if (key === null || wanted !== key || !ref.current) return;
    ref.current.focus();
    settle?.();
  }, [key, wanted, settle]);
  return ref;
}

/** Asks for focus to go to the target named `key`, as soon as it is on screen. */
export function useFocusRequest(): (key: string) => void {
  const requests = useContext(FocusContext);
  return requests?.request ?? noRequest;
}

function noRequest(): void {}

/** The names of the library's focus targets. */
export const focusKey = {
  open: (folderId: string) => `open:${folderId}`,
  rename: (folderId: string) => `rename:${folderId}`,
  newFolder: 'new-folder',
  crumb: 'crumb',
  library: 'library',
} as const;
