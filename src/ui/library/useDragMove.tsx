import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { FolderTree, MoveItem } from '../../domain/folders';
import type { Id } from '../../domain/models';

/** Only drags that start on one of our cards or tiles carry this type, so a file or text dragged in from outside is never taken for a move. */
const DRAG_TYPE = 'application/x-pearls-move';

const carriesMove = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes(DRAG_TYPE);

interface DragMove {
  tree: FolderTree;
  dragged: MoveItem | null;
  begin: (item: MoveItem) => void;
  drop: (item: MoveItem, target: Id | null) => unknown;
}

const DragMoveContext = createContext<DragMove | null>(null);

/** Makes the library's cards and tiles draggable and its tiles and crumbs drop targets; without it they are neither. */
export function DragMoveProvider({ tree, onMove, children }: { tree: FolderTree; onMove: (item: MoveItem, target: Id | null) => unknown; children: ReactNode }) {
  const [dragged, setDragged] = useState<MoveItem | null>(null);
  const pending = useRef<number | null>(null);

  const end = useCallback(() => {
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = null;
    setDragged(null);
  }, []);

  /** Deferred a tick so the picture that follows the pointer is taken before the item is dimmed. */
  const begin = useCallback((item: MoveItem) => {
    pending.current = window.setTimeout(() => {
      pending.current = null;
      setDragged(item);
    }, 0);
  }, []);

  useEffect(() => {
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
      end();
    };
  }, [end]);

  const value = useMemo<DragMove>(() => ({ tree, dragged, begin, drop: onMove }), [tree, dragged, begin, onMove]);
  return <DragMoveContext.Provider value={value}>{children}</DragMoveContext.Provider>;
}

interface DragSource {
  props: { draggable?: true; onDragStart?: (event: DragEvent) => void };
  /** True while this very item is being dragged. */
  dragging: boolean;
}

/** The attributes that make an element draggable as `item`; none outside a provider or when `enabled` is false. */
export function useDragSource(item: MoveItem, enabled = true): DragSource {
  const move = useContext(DragMoveContext);
  if (!move || !enabled) return { props: {}, dragging: false };
  const dragging = move.dragged?.kind === item.kind && move.dragged.id === item.id;
  const start = (event: DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, item.id);
    move.begin(item);
  };
  return { props: { draggable: true, onDragStart: start }, dragging };
}

interface DropTarget {
  props: { onDragOver?: (event: DragEvent) => void; onDragLeave?: (event: DragEvent) => void; onDrop?: (event: DragEvent) => void };
  /** True while a dragged item that may land here is over it. */
  highlighted: boolean;
}

/** Makes an element a drop target for the folder `target` (null is the top level). */
export function useDropTarget(target: Id | null): DropTarget {
  const move = useContext(DragMoveContext);
  const [over, setOver] = useState(false);
  if (!move) return { props: {}, highlighted: false };
  const { tree, dragged } = move;
  const accepts = dragged !== null && tree.placeProblem(dragged, target) === null;
  return {
    highlighted: over && accepts,
    props: {
      onDragOver: (event) => {
        const takes = accepts && carriesMove(event);
        event.dataTransfer.dropEffect = takes ? 'move' : 'none';
        if (!takes) return;
        event.preventDefault();
        setOver(true);
      },
      onDragLeave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (event) => {
        setOver(false);
        if (!accepts || !carriesMove(event)) return;
        event.preventDefault();
        move.drop(dragged, target);
      },
    },
  };
}
