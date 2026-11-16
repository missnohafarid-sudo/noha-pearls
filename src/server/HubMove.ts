import { restoreSnapshot, takeSnapshot, type Snapshot } from '../infrastructure/sql/snapshot';
import type { SqlDatabase } from '../ports/sql';
import { HUB_NAME } from './hubName';

/** What the new hub asks of the former one, over the platform's calls between hubs. */
export interface FormerHub {
  giveData(): Promise<Snapshot>;
  retire(): Promise<void>;
}

/**
 * Kept in the platform's key-value store, which the hub's own tables never hold: this hub gave all its data to the hub that replaced
 * it; this hub holds the former hub's data; the former hub has been told to answer nothing for good.
 */
const HANDED_OVER = 'handed-over';
const MOVED_IN = 'moved-in';
const FORMER_RETIRED = 'former-retired';

/**
 * The one-time move of the school's data from the former hub to the hub named `HUB_NAME`, both sides of it. The former hub gives
 * its data and stops answering in memory only, so asking again is safe; it stops for good when the new hub has stored the data.
 */
export class HubMove {
  private giving = false;
  private gone = false;

  constructor(
    private readonly kv: Pick<SyncKvStorage, 'get' | 'put'>,
    private readonly db: SqlDatabase,
  ) {}

  /** A hub that has handed over (or is handing over) answers nothing, keeps no socket and wakes for no alarm. */
  handedOver(): boolean {
    this.gone ||= this.kv.get<boolean>(HANDED_OVER) === true;
    return this.giving || this.gone;
  }

  /**
   * On every start, before any part reads this hub's storage: the first start of the hub named `HUB_NAME` takes all the former
   * hub's data, then retires the former hub (again on a later start, if that failed). Only a hub that has not moved needs its name
   * to know which it is; one reached without it does not start rather than open an empty school.
   */
  async moveIn(name: string | undefined, formerHub: () => FormerHub): Promise<void> {
    if (this.handedOver()) return;
    if (this.kv.get<boolean>(MOVED_IN) !== true) {
      if (name === undefined) throw new Error('The hub was reached without its name');
      if (name !== HUB_NAME) return;
      const snapshot = await formerHub().giveData();
      this.db.transaction(() => {
        restoreSnapshot(this.db, snapshot);
        this.kv.put(MOVED_IN, true);
      });
    }
    if (this.kv.get<boolean>(FORMER_RETIRED) === true) return;
    try {
      await formerHub().retire();
      this.kv.put(FORMER_RETIRED, true);
    } catch (error) {
      console.error(error);
    }
  }

  /** The former hub's first half: it answers nothing until it is built again, and returns all its data. */
  giveData(): Snapshot {
    this.giving = true;
    return takeSnapshot(this.db);
  }

  /** The former hub's second half, once the new hub has stored the data: it answers nothing for good. */
  retire(): void {
    this.kv.put(HANDED_OVER, true);
  }
}
