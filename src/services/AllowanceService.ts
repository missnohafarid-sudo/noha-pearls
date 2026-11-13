import type { DayLevel } from '../domain/abuse';
import type { Caller } from '../ports/caller';
import type { DayAllowance } from '../ports/abuse';
import type { Unsubscribe } from '../ports/store';
import { adminWatch } from './AuthService';

/** How much of the day's saving allowance is used. The teacher's only. */
export class AllowanceService {
  constructor(
    private readonly caller: Caller,
    private readonly allowance: DayAllowance,
  ) {}

  watchLevel(listener: (level: DayLevel) => void): Unsubscribe {
    return adminWatch(this.caller, listener, (emit) => this.allowance.watch(emit));
  }
}
