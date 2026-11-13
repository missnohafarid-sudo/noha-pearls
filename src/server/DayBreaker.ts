import { dayLevel, type DayLevel } from '../domain/abuse';
import { DAY_THRESHOLDS } from '../ports/limits';
import type { DayAllowance } from '../ports/abuse';
import type { Unsubscribe } from '../ports/store';

/** What the breaker reads of the database's write count. */
export interface WriteMeter {
  rowsToday(): number;
  flush(): void;
}

/**
 * How much of the day's write allowance is used, as the services and the teacher's page see it. The level follows the count
 * the database keeps; `refresh` is called after anything that wrote, and tells the watchers when the level has changed.
 */
export class DayBreaker implements DayAllowance {
  private readonly listeners = new Set<(level: DayLevel) => void>();
  private announced: DayLevel;

  constructor(private readonly meter: WriteMeter) {
    this.announced = this.level();
  }

  level(): DayLevel {
    return dayLevel(this.meter.rowsToday(), DAY_THRESHOLDS);
  }

  watch(listener: (level: DayLevel) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.level());
    return () => this.listeners.delete(listener);
  }

  refresh(): void {
    const level = this.level();
    if (level === this.announced) return;
    this.announced = level;
    for (const listener of [...this.listeners]) listener(level);
  }

  /** Saves the count and tells the watchers of a new level, even if nothing wrote lately: a new day opens everything again. */
  settle(): void {
    this.meter.flush();
    this.refresh();
  }
}
