import type { Unsubscribe } from '../ports/store';

/** A live source: calls the listener with its current value, then on every change. */
export type Watch<T> = (listener: (value: T) => void) => Unsubscribe;

/** Emits once every source has a value, then again on every change of any of them. Unsubscribing stops all of them. */
export function combineWatches<T extends unknown[]>(sources: { [K in keyof T]: Watch<T[K]> }, listener: (...values: T) => void): Unsubscribe {
  const watches: readonly Watch<unknown>[] = sources;
  const values: unknown[] = [];
  const loaded = new Set<number>();
  let open = true;
  const stops: Unsubscribe[] = [];
  watches.forEach((watch, index) => {
    stops.push(
      watch((value) => {
        if (!open) return;
        values[index] = value;
        loaded.add(index);
        if (loaded.size === watches.length) listener(...(values as T));
      }),
    );
  });
  return () => {
    open = false;
    stops.forEach((stop) => stop());
  };
}

/** A read of nothing: it gives `value` at once and never changes, so nothing is held open for it. */
export const noRead = <T>(value: T): Watch<T> => (listener) => {
  listener(value);
  return () => undefined;
};

/**
 * Pairs each value of `outer` with the value of the inner watch it selects. The inner watch is reopened only when `keyOf`
 * changes, so a change of the outer value that keeps the key re-emits the inner value it already has.
 */
export function followWatch<A, B>(outer: Watch<A>, keyOf: (outerValue: A) => string, inner: (outerValue: A) => Watch<B>): Watch<[A, B]> {
  return (listener) => {
    let key: string | null = null;
    let latest: A;
    let held: { value: B } | null = null;
    let generation = 0;
    let stopInner: Unsubscribe = () => undefined;
    const stopOuter = outer((value) => {
      latest = value;
      if (keyOf(value) === key) {
        if (held) listener([value, held.value]);
        return;
      }
      key = keyOf(value);
      stopInner();
      held = null;
      const mine = ++generation;
      stopInner = inner(value)((next) => {
        if (mine !== generation) return;
        held = { value: next };
        listener([latest, next]);
      });
    });
    return () => {
      generation++;
      stopOuter();
      stopInner();
    };
  };
}
