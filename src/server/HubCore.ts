import { commandAllowed } from '../domain/abuse';
import type { Id } from '../domain/models';
import type { AbuseGuard } from '../ports/abuse';
import type { Caller } from '../ports/caller';
import { MAX_COMPUTED_ENTRIES } from '../ports/limits';
import type { WireError } from '../ports/wire';
import { UnitOfWork } from '../infrastructure/UnitOfWork';
import type { SqlDocumentStore } from '../infrastructure/SqlDocumentStore';
import { createDataServices } from '../services/createDataServices';
import { encodeError, wireErrorOf } from '../services/errorRegistry';
import { LimitError } from '../services/LimitError';
import { RetentionService } from '../services/RetentionService';
import type { ServiceRuntime } from '../services/runtime';
import { seedIfEmpty } from '../services/seed';
import type { ServiceClasses } from '../services/Services';
import { ClassFeeds } from '../services/ClassFeeds';
import { ComputedOnce } from '../services/ComputedOnce';
import { StandingsCache } from '../services/StandingsCache';
import { SurfaceDispatcher } from '../services/surfaceDispatch';
import type { ConnectionLimits } from './ConnectionLimits';
import type { DayBreaker } from './DayBreaker';
import type { Gatekeeper } from './Gatekeeper';
import { SYSTEM_CALLER } from './identity';
import { WatchView } from './WatchView';

export type CommandOutcome = { ok: true; value: unknown } | { ok: false; error: WireError };

/**
 * What the hub does with its store, apart from any socket: one job at a time, each all or nothing; the services for
 * a caller's live reads; the first-start seed; the yearly clearing, which it runs and asks the retention service when to run next.
 * It owns what the services share between commands: the day's write allowance and the remembered standings.
 */
export class HubCore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly standings = new StandingsCache();
  private readonly lessonReads = new ComputedOnce({ maxEntries: MAX_COMPUTED_ENTRIES, sources: ['lessons'] });
  private readonly seats = new ComputedOnce({ maxEntries: MAX_COMPUTED_ENTRIES, sources: ['participants', 'sessions'] });
  private readonly classFeeds: ClassFeeds;

  constructor(
    private readonly store: SqlDocumentStore,
    private readonly gate: Gatekeeper,
    private readonly allowance: DayBreaker,
    readonly now: () => number = Date.now,
    private readonly report: (error: unknown) => void = (error) => console.error(error),
  ) {
    this.classFeeds = new ClassFeeds((dropped) => new WatchView(store, dropped), report);
  }

  /** Runs `work` after everything queued before it has finished, whether that succeeded or not. */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** What one socket is held to; the gatekeeper makes it. */
  limitsFor(address: string, device: Id): ConnectionLimits {
    return this.gate.limitsFor(address, device);
  }

  /**
   * Runs a command for a caller over a unit of work: applied together when it succeeds, not at all when it throws.
   * Once the unit has committed the caller is told it succeeded, whatever happens to a watcher afterwards.
   * Once the day's allowance of writes is used up, only what that level allows is run (see `commandAllowed`).
   */
  async command(caller: Caller, guard: AbuseGuard, service: string, method: string, args: readonly unknown[]): Promise<CommandOutcome> {
    if (!commandAllowed(this.allowance.level(), caller.isAdmin(), service, method)) return { ok: false, error: this.describe(new LimitError('day-used')) };
    const unit = new UnitOfWork(this.store);
    try {
      const value = await new SurfaceDispatcher(createDataServices(unit, caller, this.runtime(guard))).call(service, method, args);
      this.commit(unit);
      return { ok: true, value };
    } catch (error) {
      unit.rollback();
      return { ok: false, error: this.describe(error) };
    }
  }

  /** The services for a caller's live reads. Live reads see committed data only, so they read the store itself; `dropped` hears of a read the store gives up on. */
  watchingServices(caller: Caller, guard: AbuseGuard, dropped: (error: unknown) => void): ServiceClasses {
    return createDataServices(new WatchView(this.store, dropped), caller, { ...this.runtime(guard), classReads: this.classFeeds.reportingTo(dropped) });
  }

  /** The error as it may cross the wire: a known one by name and code, anything else as a bare failure and logged here. */
  describe(error: unknown): WireError {
    if (encodeError(error) === null) this.report(error);
    return wireErrorOf(error);
  }

  /** Fills an empty database the way the browser does on first start. */
  async seed(): Promise<void> {
    const unit = new UnitOfWork(this.store);
    await seedIfEmpty(unit);
    this.commit(unit);
  }

  /** When the hub looks for a due clearing next (asked of the retention service). */
  nextCheckAt(): Promise<number> {
    return new RetentionService(this.store, SYSTEM_CALLER, this.now).nextCheckAt();
  }

  /** The alarm's work, in the same line as the commands: clears the students' data if the school year has ended, then returns when to look again. */
  runAlarm(): Promise<number> {
    return this.exclusive(async () => {
      const unit = new UnitOfWork(this.store);
      try {
        await new RetentionService(unit, SYSTEM_CALLER, this.now).clearIfDue();
        this.commit(unit);
      } catch (error) {
        unit.rollback();
        this.report(error);
      }
      this.gate.prune();
      this.allowance.settle();
      return this.nextCheckAt();
    });
  }

  /**
   * Applies the unit's writes and tells what depends on them. What is computed once for everyone is forgotten first, because
   * applying the writes already tells the live reads, and they must not be shown a value from before the change.
   */
  private commit(unit: UnitOfWork): void {
    const changed = unit.changedCollections();
    for (const shared of [this.standings, this.lessonReads, this.seats]) shared.afterChange(changed);
    unit.commit();
    this.allowance.refresh();
  }

  private runtime(guard: AbuseGuard): ServiceRuntime {
    return { guard, allowance: this.allowance, standings: this.standings, lessonReads: this.lessonReads };
  }
}
