import { t } from '../../i18n';
import { classIdOf, classRoute, isClassPage, isSessionPage, sessionCodeOf, sessionRoute, type Route } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';

export type NavName = keyof typeof t.shell.nav;

export const NAV: readonly NavName[] = ['home', 'board', 'session', 'monitor', 'roster', 'cards', 'standings'];

/** A link of the navigation; the pages about one class keep the class (a session, or a school class) the visitor is in. */
function navTarget(name: NavName, route: Route): Route {
  if (isSessionPage(name)) return sessionRoute(name, sessionCodeOf(route));
  if (isClassPage(name)) return classRoute(name, classIdOf(route));
  return { name };
}

/** One page of the navigation, marked when it is the page being shown. The row of tabs and the menu both draw their pages with it. */
export function NavLink({ name, route }: { name: NavName; route: Route }) {
  const current = name === route.name;
  return (
    <RouteLink to={navTarget(name, route)} className={`shell__link${current ? ' shell__link--current' : ''}`} current={current}>
      {t.shell.nav[name]}
    </RouteLink>
  );
}
