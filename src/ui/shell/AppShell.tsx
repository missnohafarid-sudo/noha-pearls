import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { useAdmin, useSite } from '../hooks/data';
import { ADMIN_ROUTES, classIdOf, classRoute, isClassPage, isSessionPage, sessionCodeOf, sessionRoute, type Route } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import { useServices } from '../ServicesContext';
import { PanelHostContext } from './AdminPanel';
import { AdminUnlock } from './AdminUnlock';
import { useClearWhenDue } from './useClearWhenDue';
import './shell.css';

type NavName = keyof typeof t.shell.nav;

const NAV: readonly NavName[] = ['home', 'board', 'session', 'monitor', 'roster', 'cards', 'standings'];

/** A link of the navigation; the pages about one class keep the class (a session, or a school class) the visitor is in. */
function navTarget(name: NavName, route: Route): Route {
  if (isSessionPage(name)) return sessionRoute(name, sessionCodeOf(route));
  if (isClassPage(name)) return classRoute(name, classIdOf(route));
  return { name };
}

/** The frame around every page: title bar, navigation, and the admin's editing panel. */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const admin = useAdmin();
  const site = useSite();
  const { auth } = useServices();
  useClearWhenDue();
  const [signingIn, setSigningIn] = useState(false);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current?.querySelector('.shell__link--current')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [route.name]);
  const links = NAV.filter((name) => admin || !ADMIN_ROUTES.has(name));

  return (
    <div className="shell">
      <header className="shell__bar">
        <RouteLink to={{ name: 'home' }} className="shell__brand rose-gold">
          {site?.title ?? ''}
        </RouteLink>
        <nav className="shell__nav" ref={nav}>
          {links.map((name) => (
            <RouteLink
              key={name}
              to={navTarget(name, route)}
              className={`shell__link${name === route.name ? ' shell__link--current' : ''}`}
            >
              {t.shell.nav[name]}
            </RouteLink>
          ))}
        </nav>
        {admin ? (
          <div className="shell__admin">
            <span className="chip chip--accent">{t.shell.adminBadge}</span>
            <button type="button" className="btn btn--small" onClick={() => void auth.signOut()}>
              {t.shell.signOut}
            </button>
          </div>
        ) : (
          <div className="shell__admin">
            <button type="button" className="btn btn--small" onClick={() => setSigningIn(true)}>
              {t.shell.signIn}
            </button>
          </div>
        )}
      </header>
      {signingIn && <AdminUnlock onClose={() => setSigningIn(false)} />}
      <div className={`shell__body${admin ? ' shell__body--admin' : ''}`}>
        <PanelHostContext.Provider value={panelHost}>
          <main className="shell__main">{children}</main>
        </PanelHostContext.Provider>
        {admin && <aside className="shell__panel" ref={setPanelHost} aria-label={t.shell.panelLabel} />}
      </div>
    </div>
  );
}
