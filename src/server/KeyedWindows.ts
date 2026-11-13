import { hasRoom, isOverLimit, withEvent, withinWindow, type WindowLimit } from '../domain/abuse';
import type { WindowMemory } from '../ports/abuse';

/** Events counted per key (an address, a device) over a sliding window. The counting rules are the domain's; where the moments are kept is the memory's. */
export class KeyedWindows {
  constructor(
    private readonly limit: WindowLimit,
    private readonly now: () => number,
    private readonly memory: WindowMemory = new Map<string, number[]>(),
  ) {}

  record(key: string): void {
    this.memory.set(key, withEvent(this.memory.get(key) ?? [], this.now(), this.limit.windowMs));
  }

  /** Whether one more event would still fit the limit. */
  hasRoom(key: string): boolean {
    return hasRoom(this.memory.get(key) ?? [], this.now(), this.limit);
  }

  /** Whether the events in the window already number more than the limit allows. */
  isOver(key: string): boolean {
    return isOverLimit(this.memory.get(key) ?? [], this.now(), this.limit);
  }

  clear(key: string): void {
    this.memory.delete(key);
  }

  /** Forgets the keys with no event left in the window; `owns` names the keys that are this count's, when the memory is shared with others. */
  prune(owns: (key: string) => boolean = () => true): void {
    for (const key of [...this.memory.keys()].filter(owns)) if (withinWindow(this.memory.get(key) ?? [], this.now(), this.limit.windowMs).length === 0) this.memory.delete(key);
  }
}
