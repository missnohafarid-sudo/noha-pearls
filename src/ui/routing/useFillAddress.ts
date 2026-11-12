import { useEffect } from 'react';
import { navigate, routeHash, type Route } from './routes';

/**
 * Puts what a page chose into the address (replacing it, so Back does not loop), so a reload or a
 * bookmark stays on the same choice. `null` leaves the address as it is.
 */
export function useFillAddress(wanted: Route | null): void {
  const hash = wanted && routeHash(wanted);

  useEffect(() => {
    if (wanted && hash) navigate(wanted, { replace: true });
    // `hash` stands for `wanted`: it changes exactly when the address to write changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
}
