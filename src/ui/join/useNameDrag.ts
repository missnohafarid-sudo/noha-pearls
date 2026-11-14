import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { Id } from '../../domain/models';

/** How far a pointer must travel before a press on a name is a drag and not a tap. */
const DRAG_THRESHOLD = 6;
/** A pointer click on the name this soon after its drag ended is the drag's own release, not a tap; a key press is never one. */
const CLICK_AFTER_DRAG_MS = 400;
const OVER_CLASS = 'slide-option-slot--over';

interface Press {
  id: Id;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export interface NameDrag {
  /** The student whose name is being dragged, while one is. */
  dragging: Id | null;
  /** Put on the floating copy of the name while `dragging`; its place follows the pointer. */
  ghost: RefObject<HTMLElement | null>;
  /** Handlers for the element that carries one student's name. */
  handlersOf: (id: Id) => {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onClick: (event: MouseEvent<HTMLElement>) => void;
  };
}

function optionUnder(x: number, y: number): HTMLElement | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-option]') ?? null;
}

function clearOver(): void {
  for (const marked of document.querySelectorAll(`.${OVER_CLASS}`)) marked.classList.remove(OVER_CLASS);
}

/**
 * Moving a name onto an option with a mouse, a finger or a pen alike (Pointer Events, not the HTML5 drag, which a tablet
 * starts only after a long press). The option under the pointer is found by its `data-option` and wears `slide-option-slot--over`.
 * A press that does not travel is a tap: `onTap` (also what Enter and Space on a button give, as a click).
 * The press ends on the document, so it ends even when the name is removed or disabled while it is held.
 * The floating copy is placed through custom properties, as `useAnchoredLayer` places its layer.
 */
export function useNameDrag(enabled: boolean, onDrop: (id: Id, option: number) => void, onTap: (id: Id) => void): NameDrag {
  const [dragging, setDragging] = useState<Id | null>(null);
  const ghost = useRef<HTMLElement | null>(null);
  const press = useRef<Press | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const release = useRef<(() => void) | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const dragEnded = useRef({ id: '', at: Number.NEGATIVE_INFINITY });

  const place = useCallback(() => {
    const floating = ghost.current;
    if (!floating) return;
    const viewportWidth = document.documentElement.clientWidth;
    const rtl = getComputedStyle(floating).direction === 'rtl';
    const x = last.current.x - floating.offsetWidth / 2;
    floating.style.setProperty('--drag-x', `${rtl ? viewportWidth - x - floating.offsetWidth : x}px`);
    floating.style.setProperty('--drag-y', `${last.current.y - floating.offsetHeight / 2}px`);
  }, []);

  useLayoutEffect(() => {
    if (dragging !== null) place();
  }, [dragging, place]);

  const reset = useCallback(() => {
    release.current?.();
    release.current = null;
    press.current = null;
    clearOver();
    setDragging(null);
  }, []);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  useEffect(() => reset, [reset]);

  const finish = useCallback(
    (event: globalThis.PointerEvent, drop: boolean) => {
      const current = press.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const target = current.moved && drop ? optionUnder(event.clientX, event.clientY) : null;
      const moved = current.moved;
      reset();
      if (moved) dragEnded.current = { id: current.id, at: performance.now() };
      if (target) onDropRef.current(current.id, Number(target.dataset.option));
    },
    [reset],
  );

  const handlersOf = (id: Id): ReturnType<NameDrag['handlersOf']> => ({
    onPointerDown: (event) => {
      if (!enabled || event.button !== 0 || press.current) return;
      press.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
      last.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      const up = (released: globalThis.PointerEvent) => finish(released, true);
      const cancel = (released: globalThis.PointerEvent) => finish(released, false);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      release.current = () => {
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
      };
    },
    onPointerMove: (event) => {
      const current = press.current;
      if (!current || current.pointerId !== event.pointerId) return;
      last.current = { x: event.clientX, y: event.clientY };
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return;
      if (!current.moved) {
        current.moved = true;
        setDragging(id);
      }
      place();
      const over = optionUnder(event.clientX, event.clientY);
      clearOver();
      over?.classList.add(OVER_CLASS);
    },
    onClick: (event) => {
      const releaseOfDrag = event.detail > 0 && dragEnded.current.id === id && performance.now() - dragEnded.current.at < CLICK_AFTER_DRAG_MS;
      if (enabled && !releaseOfDrag) onTap(id);
    },
  });

  return { dragging, ghost, handlersOf };
}
