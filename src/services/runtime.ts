import { NO_ALLOWANCE, NO_GUARD, type AbuseGuard, type DayAllowance } from '../ports/abuse';
import { StandingsCache } from './StandingsCache';

/** What the services are given by the place they run in, beyond the store and the caller. */
export interface ServiceRuntime {
  guard: AbuseGuard;
  allowance: DayAllowance;
  standings: StandingsCache;
}

/** A place with no transport to hold anyone to a share, such as the page's own browser store. */
export const unlimitedRuntime = (): ServiceRuntime => ({ guard: NO_GUARD, allowance: NO_ALLOWANCE, standings: new StandingsCache(false) });
