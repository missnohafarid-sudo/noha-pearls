/** The single home of how long the page waits before it opens its socket again. Pure: the dice are passed in. */

export interface RetryPolicy {
  readonly firstMs: number;
  /** The first this many tries double from `firstMs` up to `quickMaxMs`; after them the wait keeps doubling up to `slowMaxMs`. */
  readonly quickTries: number;
  readonly quickMaxMs: number;
  readonly slowMaxMs: number;
  /** The least a page waits after the hub turned it away for sending too much or for its address. */
  readonly limitedMs: number;
}

/**
 * The wait before the next try, after `failures` failed ones: between half and all of the doubled wait, so that pages
 * that lost the hub together do not return together. `random` is a number from 0 up to 1.
 */
export function retryDelay(failures: number, turnedAway: boolean, random: number, policy: RetryPolicy): number {
  const quick = Math.min(policy.firstMs * 2 ** failures, policy.quickMaxMs);
  const slow = Math.min(policy.quickMaxMs * 2 ** (failures - policy.quickTries + 1), policy.slowMaxMs);
  const base = failures < policy.quickTries ? quick : slow;
  return Math.max(base, turnedAway ? policy.limitedMs : 0) * (0.5 + random / 2);
}
