import { NO_ALLOWANCE, NO_GUARD, type AbuseGuard, type DayAllowance } from '../ports/abuse';
import { NO_HUB_PLACE, type HubPlace } from '../ports/hubPlace';
import type { ClassReads } from './ClassFeeds';
import { NOT_REMEMBERED, type ComputedOnce } from './ComputedOnce';

/** What the services are given by the place they run in, beyond the store and the caller. */
export interface ServiceRuntime {
  guard: AbuseGuard;
  allowance: DayAllowance;
  hubPlace: HubPlace;
  /** The cumulative results of a class list, computed once per change of what they read. */
  standings: ComputedOnce;
  /** What every reader of the lessons is shown alike, computed once per change of the lessons. */
  lessonReads: ComputedOnce;
  /** The live reads of classes that many watchers share; without it the services share one among themselves. */
  classReads?: ClassReads;
}

/** A place with no transport to hold anyone to a share, such as the page's own browser store. */
export const unlimitedRuntime = (): ServiceRuntime => ({ guard: NO_GUARD, allowance: NO_ALLOWANCE, hubPlace: NO_HUB_PLACE, standings: NOT_REMEMBERED, lessonReads: NOT_REMEMBERED });
