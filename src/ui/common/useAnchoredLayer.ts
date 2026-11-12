import { useLayoutEffect, useState, type RefObject } from 'react';

const GAP = 4;
const MARGIN = 8;
const UNLIMITED = '9999px';

/** Where a layer is rendered so nothing clips it and it stays visible: inside the modal dialog or the full-screen stage the anchor sits in, else the body. */
function layerHost(anchor: HTMLElement | null): Element {
  return anchor?.closest('dialog') ?? document.fullscreenElement ?? document.body;
}

/**
 * Places a floating layer (a `.layer`, portalled into the returned host) beside its anchor:
 * below it, or above it when there is more room there, kept inside the viewport and following scroll and resize.
 * The numbers reach the stylesheet as custom properties; `matchWidth` makes the layer as wide as the anchor.
 * Returns the host to portal into, or `null` while the layer is closed or the host is not yet known.
 */
export function useAnchoredLayer(anchor: RefObject<HTMLElement | null>, layer: RefObject<HTMLElement | null>, open: boolean, matchWidth: boolean): Element | null {
  const [host, setHost] = useState<Element | null>(null);

  useLayoutEffect(() => {
    setHost(open ? layerHost(anchor.current) : null);
  }, [anchor, open]);

  useLayoutEffect(() => {
    if (!open || !host) return undefined;
    const place = () => {
      const anchorBox = anchor.current;
      const floating = layer.current;
      if (!anchorBox || !floating) return;
      const rect = anchorBox.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const set = (name: string, value: string) => floating.style.setProperty(name, value);

      if (matchWidth) set('--layer-width', `${rect.width}px`);
      set('--layer-room', UNLIMITED);
      const natural = floating.offsetHeight;
      const below = window.innerHeight - rect.bottom - GAP - MARGIN;
      const above = rect.top - GAP - MARGIN;
      const flip = natural > below && above > below;
      const room = flip ? above : below;
      set('--layer-room', `${Math.max(room, 0)}px`);

      const edge = getComputedStyle(anchorBox).direction === 'rtl' ? viewportWidth - rect.right : rect.left;
      set('--layer-start', `${Math.min(Math.max(edge, MARGIN), Math.max(viewportWidth - floating.offsetWidth - MARGIN, MARGIN))}px`);
      set('--layer-top', `${flip ? rect.top - GAP - Math.min(natural, room) : rect.bottom + GAP}px`);
    };
    place();
    window.addEventListener('resize', place);
    const follow = (event: Event) => {
      if (event.target !== layer.current) place();
    };
    window.addEventListener('scroll', follow, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', follow, true);
    };
  }, [anchor, layer, open, host, matchWidth]);

  return open ? host : null;
}
