import { useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { useAdmin, useSite } from '../hooks/data';
import { ADMIN_ROUTES, type Route } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import { useServices } from '../ServicesContext';
import { PanelHostContext } from './AdminPanel';
import { AdminUnlock } from './AdminUnlock';
import { NAV, NavLink } from './NavLink';
import { NavMenu } from './NavMenu';
import './shell.css';

/** The frame around every page: title bar, navigation, and the admin's editing panel. */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const admin = useAdmin();
  const site = useSite();
  const { auth } = useServices();
  const [signingIn, setSigningIn] = useState(false);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const links = NAV.filter((name) => admin || !ADMIN_ROUTES.has(name));

  return (
    <div className="shell">
      <header className="shell__bar">
        <RouteLink to={{ name: 'home' }} className="shell__brand rose-gold">
          {site?.title ?? ''}
        </RouteLink>
        <nav className={`shell__nav${admin ? ' shell__nav--collapsible' : ''}`}>
          {links.map((name) => (
            <NavLink key={name} name={name} route={route} />
          ))}
        </nav>
        {admin && <NavMenu names={links} route={route} />}
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
