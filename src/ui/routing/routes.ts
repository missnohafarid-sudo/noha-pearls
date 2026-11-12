import type { Id } from '../../domain/models';

/**
 * The single home for addresses. Hash routes work on any static host without
 * server rewrites. Pages build links with `routeHash` / `routeUrl`; nobody
 * concatenates paths by hand.
 */

/** Pages about one class: the address names it with its code, or leaves it to the rule in `domain/sessions.ts`. */
const SESSION_PAGES = ['board', 'session', 'monitor'] as const;
export type SessionPageName = (typeof SESSION_PAGES)[number];

export function isSessionPage(name: string): name is SessionPageName {
  return (SESSION_PAGES as readonly string[]).includes(name);
}

/** Pages about one school class: the address names it with its id, or leaves it to the rule in `domain/roster.ts`. */
const CLASS_PAGES = ['roster', 'cards', 'standings'] as const;
export type ClassPageName = (typeof CLASS_PAGES)[number];

export function isClassPage(name: string): name is ClassPageName {
  return (CLASS_PAGES as readonly string[]).includes(name);
}

export type Route =
  | { name: 'home' }
  | { name: 'lesson'; lessonId: Id; slideIndex: number }
  | { name: SessionPageName; code?: string }
  | { name: ClassPageName; classId?: Id }
  | { name: 'join'; code: string; groupId: Id }
  | { name: 'notFound' };

export type RouteName = Route['name'];

type SessionRoute = Extract<Route, { name: SessionPageName }>;
type ClassRoute = Extract<Route, { name: ClassPageName }>;

function isSessionRoute(route: Route): route is SessionRoute {
  return isSessionPage(route.name);
}

function isClassRoute(route: Route): route is ClassRoute {
  return isClassPage(route.name);
}

/** Pages that exist only for the admin. Everyone else gets "not found". */
export const ADMIN_ROUTES: ReadonlySet<RouteName> = new Set(['session', 'monitor', 'roster', 'cards', 'standings']);

/** Pages shown without the site frame: a student's device shows nothing but the class. */
export const BARE_ROUTES: ReadonlySet<RouteName> = new Set(['join']);

export function routeHash(route: Route): string {
  if (isSessionRoute(route)) return route.code === undefined ? `#/${route.name}` : `#/${route.name}/${encodeURIComponent(route.code)}`;
  if (isClassRoute(route)) return route.classId === undefined ? `#/${route.name}` : `#/${route.name}/${encodeURIComponent(route.classId)}`;
  switch (route.name) {
    case 'home':
      return '#/';
    case 'lesson':
      return `#/lesson/${encodeURIComponent(route.lessonId)}/${route.slideIndex + 1}`;
    case 'join':
      return `#/join/${encodeURIComponent(route.code)}/${encodeURIComponent(route.groupId)}`;
    case 'notFound':
      return '#/404';
  }
}

export function sessionRoute(name: SessionPageName, code?: string): Route {
  return code ? { name, code } : { name };
}

/** The class an address names, if it names one. */
export function sessionCodeOf(route: Route): string | undefined {
  return isSessionRoute(route) ? route.code : undefined;
}

export function classRoute(name: ClassPageName, classId?: Id): Route {
  return classId ? { name, classId } : { name };
}

/** The school class an address names, if it names one. */
export function classIdOf(route: Route): Id | undefined {
  return isClassRoute(route) ? route.classId : undefined;
}

function segments(hash: string): string[] | null {
  try {
    return hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
}

export function parseRoute(hash: string): Route {
  const [name = '', a, b] = segments(hash) ?? ['404'];
  if (isSessionPage(name)) return sessionRoute(name, a);
  if (isClassPage(name)) return classRoute(name, a);
  switch (name) {
    case '':
      return { name: 'home' };
    case 'lesson':
      return a ? { name: 'lesson', lessonId: a, slideIndex: Math.max(0, (Number(b) || 1) - 1) } : { name: 'notFound' };
    case 'join':
      return a && b ? { name: 'join', code: a, groupId: b } : { name: 'notFound' };
    default:
      return { name: 'notFound' };
  }
}

/** Full address, for QR codes and links opened on other devices. */
export function routeUrl(route: Route): string {
  return `${window.location.origin}${window.location.pathname}${routeHash(route)}`;
}

/** The site's address as people type it: host and path, with no protocol and no hash (an empty hash opens the home page). */
export function siteAddress(): string {
  return `${window.location.host}${window.location.pathname}`;
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeHash(route);
  if (options.replace) window.location.replace(hash);
  else window.location.hash = hash;
}
