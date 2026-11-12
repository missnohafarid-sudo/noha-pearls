import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Puts one element (the slide stage) in full-screen and reports whether it is. */
export function useFullscreen(target: RefObject<HTMLElement | null>): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [target]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.current?.requestFullscreen();
  }, [target]);

  return { active, toggle };
}
