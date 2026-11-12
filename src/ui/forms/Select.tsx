import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { listKeyEffect, typeaheadIndex } from '../../domain/listNavigation';
import { useAnchoredLayer } from '../common/useAnchoredLayer';

interface SelectItem {
  value: string;
  label: string;
}

interface SelectProps {
  options: readonly SelectItem[];
  value: string;
  onChange: (value: string) => void;
  /** Names it where there is no visible label. */
  'aria-label'?: string;
  /** Adds to the closed button's own class, to size it inside a row. */
  className?: string;
}

const TYPING_PAUSE_MS = 700;

/**
 * Our own drop-down: a button showing the chosen option, and a list of options under it (the WAI-ARIA select-only combobox).
 * Focus stays on the button; the highlighted option is named by `aria-activedescendant`.
 */
export function Select({ options, value, onChange, 'aria-label': ariaLabel, className = '' }: SelectProps) {
  const listId = useId();
  const buttonId = `${listId}-button`;
  const optionId = (index: number) => `${listId}-${index}`;
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', timer: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);

  const host = useAnchoredLayer(button, list, open, true);

  useEffect(() => {
    if (!open) return undefined;
    const within = (parts: readonly (Element | null | undefined)[], target: Node) => parts.some((part) => part?.contains(target));
    const labels = () => [...(button.current?.labels ?? [])];
    const closeOutside = (event: PointerEvent) => {
      if (!within([button.current, list.current, ...labels()], event.target as Node)) setOpen(false);
    };
    // A press on the label text ends in a click on the button, which closes the list itself; focus must not leave it first.
    const keepFocus = (event: MouseEvent) => {
      if (within(labels(), event.target as Node)) event.preventDefault();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('mousedown', keepFocus);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('mousedown', keepFocus);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => () => window.clearTimeout(typed.current.timer), []);

  const show = (index: number) => {
    setActive(index);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const type = (letter: string) => {
    window.clearTimeout(typed.current.timer);
    typed.current.text += letter;
    typed.current.timer = window.setTimeout(() => (typed.current.text = ''), TYPING_PAUSE_MS);
    const found = typeaheadIndex(options.map((option) => option.label), open ? active : selected, typed.current.text);
    if (found >= 0) show(found);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (event.ctrlKey || event.metaKey) return;
    const effect = listKeyEffect(open, key, event.altKey, selected, active, options.length);
    if (effect.type === 'none') {
      if (!event.altKey && key.length === 1) type(key);
      return;
    }
    if (key !== 'Tab') event.preventDefault();
    if (key === 'Escape') event.stopPropagation();
    if (effect.type === 'open') show(effect.index);
    else if (effect.type === 'move') setActive(effect.index);
    else if (effect.type === 'choose') choose(active);
    else setOpen(false);
  };

  return (
    <>
      <button
        ref={button}
        id={buttonId}
        type="button"
        role="combobox"
        className={`input select ${className}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.currentTarget.focus();
          if (open) setOpen(false);
          else show(Math.max(selected, 0));
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => event.key === ' ' && event.preventDefault()}
        onBlur={() => setOpen(false)}
      >
        <span className="select__value">{options[selected]?.label}</span>
        <span className="chevron" aria-hidden="true" />
      </button>
      {host &&
        createPortal(
          <ul ref={list} id={listId} role="listbox" aria-labelledby={buttonId} className="layer select__list list-reset" onMouseDown={(event) => event.preventDefault()}>
            {options.map((option, index) => (
              <li
                key={index}
                id={optionId(index)}
                role="option"
                aria-selected={index === selected}
                className={index === active ? 'select__option select__option--active' : 'select__option'}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {option.label}
              </li>
            ))}
          </ul>,
          host,
        )}
    </>
  );
}
