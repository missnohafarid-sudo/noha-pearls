import { useEffect, useState, type DependencyList } from 'react';
import type { Unsubscribe } from '../../ports/store';

export type Subscribe<T> = (listener: (value: T) => void) => Unsubscribe;

/**
 * Keeps a component in sync with a live query.
 * Returns `undefined` until the first value arrives, and while `subscribe` is null.
 */
export function useLive<T>(subscribe: Subscribe<T> | null, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T>();

  useEffect(() => {
    setValue(undefined);
    if (!subscribe) return undefined;
    return subscribe((next) => setValue(() => next));
    // The caller lists what `subscribe` closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
