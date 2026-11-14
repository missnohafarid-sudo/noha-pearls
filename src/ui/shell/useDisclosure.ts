import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * How a button opens and closes a list under it. Opening moves focus to the current item (the one marked `aria-current`);
 * choosing, Escape or a press outside closes it, and Escape returns focus to the button.
 * `root` wraps both the button and the list.
 */
export function useDisclosure<List extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<List>(null);

  useEffect(() => {
    if (!open) return undefined;
    list.current?.querySelector<HTMLElement>('[aria-current]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    close();
  };

  return { open, root, button, list, close, toggle: () => (open ? close() : setOpen(true)), onKeyDown };
}
