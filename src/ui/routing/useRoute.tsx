import { useSyncExternalStore, type ReactNode } from 'react';
import { parseRoute, routeHash, type Route } from './routes';

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

export function RouteLink({ to, className, children }: { to: Route; className?: string; children: ReactNode }) {
  return (
    <a href={routeHash(to)} className={className}>
      {children}
    </a>
  );
}
