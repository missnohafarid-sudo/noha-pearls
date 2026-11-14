import { useId } from 'react';
import { t } from '../../i18n';
import type { Route } from '../routing/routes';
import { NavLink, type NavName } from './NavLink';
import { useDisclosure } from './useDisclosure';
import './navMenu.css';

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/**
 * The pages of the navigation as a menu, for when the row of tabs does not fit: a button that opens them in a
 * vertical list. A page chosen, Escape, or a press outside closes it; focus goes into the list on opening and back to the button on closing.
 */
export function NavMenu({ names, route }: { names: readonly NavName[]; route: Route }) {
  const listId = useId();
  const { open, root, button, list, close, toggle, onKeyDown } = useDisclosure<HTMLElement>();
  const current = names.find((name) => name === route.name);

  return (
    <div className="shell__menu" ref={root} onKeyDown={onKeyDown}>
      <button type="button" ref={button} className="btn shell__menu-button" aria-expanded={open} aria-controls={listId} onClick={toggle}>
        <MenuIcon />
        {t.shell.menu}
        {current && <span className="shell__menu-current">{t.shell.nav[current]}</span>}
      </button>
      <nav id={listId} ref={list} className="shell__menu-list" aria-label={t.shell.menu} hidden={!open} onClick={close}>
        {names.map((name) => (
          <NavLink key={name} name={name} route={route} />
        ))}
      </nav>
    </div>
  );
}
