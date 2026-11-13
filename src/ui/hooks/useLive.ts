import { useEffect, useState, type DependencyList } from 'react';
import type { RefusableListener } from '../../ports/remote';
import type { Unsubscribe } from '../../ports/store';
import { NotAuthorizedError } from '../../services/AuthService';

export type Subscribe<T> = (listener: (value: T) => void) => Unsubscribe;

/**
 * Keeps a component in sync with a live query.
 * Returns `undefined` until the first value arrives, and while `subscribe` is null.
 * If the hub refuses or drops the read, the component fails like any other broken screen (the error page) instead of staying
 * "loading" for good; a read refused only because she is not the admin is the exception, since the screen is about to change.
 */
export function useLive<T>(subscribe: Subscribe<T> | null, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T>();
  const [refusal, setRefusal] = useState<Error>();

  useEffect(() => {
    setValue(undefined);
    setRefusal(undefined);
    if (!subscribe) return undefined;
    const listener: RefusableListener<T> = Object.assign((next: T) => setValue(() => next), { onRefused: (error: Error) => setRefusal(error) });
    return subscribe(listener);
    // The caller lists what `subscribe` closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (refusal && !(refusal instanceof NotAuthorizedError)) throw refusal;
  return value;
}
