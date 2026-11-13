import { hasRoom, isOverLimit, withEvent, withinWindow, type WindowLimit } from '../domain/abuse';

/** Events counted per key (an address, a device) over a sliding window, in memory only. The counting rules are the domain's. */
export class KeyedWindows {
  private readonly events = new Map<string, number[]>();

  constructor(
    private readonly limit: WindowLimit,
    private readonly now: () => number,
  ) {}

  record(key: string): void {
    this.events.set(key, withEvent(this.events.get(key) ?? [], this.now(), this.limit.windowMs));
  }

  /** Whether one more event would still fit the limit. */
  hasRoom(key: string): boolean {
    return hasRoom(this.events.get(key) ?? [], this.now(), this.limit);
  }

  /** Whether the events so far number more than the limit allows. */
  isOver(key: string): boolean {
    return isOverLimit(this.events.get(key) ?? [], this.now(), this.limit);
  }

  clear(key: string): void {
    this.events.delete(key);
  }

  /** Forgets the keys with no event left in the window. */
  prune(): void {
    for (const [key, times] of this.events) if (withinWindow(times, this.now(), this.limit.windowMs).length === 0) this.events.delete(key);
  }
}
