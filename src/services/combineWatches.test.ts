import { describe, expect, it } from 'vitest';
import { combineWatches, followWatch, type Watch } from './combineWatches';

/** A source the test drives by hand; `open` counts the listeners still subscribed. */
function source<T>() {
  const listeners = new Set<(value: T) => void>();
  const watch: Watch<T> = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { watch, emit: (value: T) => listeners.forEach((listener) => listener(value)), open: () => listeners.size };
}

describe('combineWatches', () => {
  it('says nothing until every source has a value, then once per change', () => {
    const a = source<number>();
    const b = source<string>();
    const seen: [number, string][] = [];
    combineWatches<[number, string]>([a.watch, b.watch], (x, y) => seen.push([x, y]));
    a.emit(1);
    a.emit(2);
    expect(seen).toEqual([]);
    b.emit('x');
    expect(seen).toEqual([[2, 'x']]);
    a.emit(3);
    b.emit('y');
    expect(seen).toEqual([[2, 'x'], [3, 'x'], [3, 'y']]);
  });

  it('stops every source and every emission when unsubscribed', () => {
    const a = source<number>();
    const b = source<number>();
    const seen: number[] = [];
    const stop = combineWatches<[number, number]>([a.watch, b.watch], (x, y) => seen.push(x + y));
    a.emit(1);
    b.emit(1);
    stop();
    expect([a.open(), b.open()]).toEqual([0, 0]);
    a.emit(5);
    expect(seen).toEqual([2]);
  });
});

describe('followWatch', () => {
  const setup = () => {
    const outer = source<{ key: string; label: string }>();
    const inners = new Map<string, ReturnType<typeof source<string>>>();
    const opened: string[] = [];
    const followed = followWatch(
      outer.watch,
      (value) => value.key,
      (value) => {
        opened.push(value.key);
        const inner = source<string>();
        inners.set(value.key, inner);
        return inner.watch;
      },
    );
    const seen: [string, string][] = [];
    const stop = followed(([value, inner]) => seen.push([value.label, inner]));
    return { outer, inners, opened, seen, stop };
  };

  it('closes the old inner watch when the key changes and ignores what it says afterwards', () => {
    const { outer, inners, opened, seen } = setup();
    outer.emit({ key: 'a', label: 'one' });
    inners.get('a')!.emit('A1');
    outer.emit({ key: 'b', label: 'two' });
    expect(inners.get('a')!.open()).toBe(0);
    expect(seen).toEqual([['one', 'A1']]);
    inners.get('b')!.emit('B1');
    expect(opened).toEqual(['a', 'b']);
    expect(seen).toEqual([['one', 'A1'], ['two', 'B1']]);
  });

  it('keeps the inner watch for the same key and re-emits its value with the new outer value', () => {
    const { outer, inners, opened, seen } = setup();
    outer.emit({ key: 'a', label: 'one' });
    outer.emit({ key: 'a', label: 'same key, nothing inside yet' });
    inners.get('a')!.emit('A1');
    outer.emit({ key: 'a', label: 'two' });
    expect(opened).toEqual(['a']);
    expect(seen).toEqual([['same key, nothing inside yet', 'A1'], ['two', 'A1']]);
  });

  it('closes both watches when unsubscribed', () => {
    const { outer, inners, stop } = setup();
    outer.emit({ key: 'a', label: 'one' });
    stop();
    expect([outer.open(), inners.get('a')!.open()]).toEqual([0, 0]);
  });
});
