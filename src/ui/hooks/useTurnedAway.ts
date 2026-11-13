import { useSyncExternalStore } from 'react';
import type { TurnedAway } from '../../ports/remote';
import { useServices } from '../ServicesContext';

/** Why the hub turned this page away, while it did; otherwise null. */
export function useTurnedAway(): TurnedAway | null {
  const { connection } = useServices();
  return useSyncExternalStore(
    (listener) => connection.subscribe(listener),
    () => connection.turnedAway(),
  );
}
