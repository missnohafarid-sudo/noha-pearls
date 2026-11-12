import { useEffect } from 'react';
import { clampIndex } from '../../domain/lessonOps';
import { t } from '../../i18n';

/**
 * Keys that move through slides. The interface is right-to-left, so "forward"
 * is the left arrow; PageDown/PageUp are what presentation clickers send.
 */
const NEXT_KEYS = new Set(['ArrowLeft', 'PageDown', ' ']);
const PREVIOUS_KEYS = new Set(['ArrowRight', 'PageUp']);

interface SlideNavProps {
  index: number;
  count: number;
  onGo: (index: number) => void;
  /** Also listen for the arrow, page and space keys anywhere on the page. */
  keyboard?: boolean;
}

/** Previous/next controls with the slide counter. Every slideshow in the app uses this one. */
export function SlideNav({ index, count, onGo, keyboard = false }: SlideNavProps) {
  const go = (delta: number) => {
    const target = clampIndex(index + delta, count);
    if (target !== index) onGo(target);
  };

  useEffect(() => {
    if (!keyboard) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing = target?.closest('input, textarea, select, dialog, [role="combobox"]');
      // Space on a focused button already presses that button.
      const pressesButton = event.key === ' ' && target?.closest('button');
      if (typing || pressesButton || event.ctrlKey || event.metaKey || event.altKey) return;
      const delta = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
      if (delta === 0) return;
      event.preventDefault();
      go(delta);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="row slide-nav">
      <button type="button" className="btn" disabled={index <= 0} onClick={() => go(-1)}>
        {t.common.previous}
      </button>
      <span className="muted">{t.common.slideOf(count === 0 ? 0 : index + 1, count)}</span>
      <button type="button" className="btn btn--primary" disabled={index >= count - 1} onClick={() => go(1)}>
        {t.common.next}
      </button>
    </div>
  );
}
