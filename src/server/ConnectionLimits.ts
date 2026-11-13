import type { Id } from '../domain/models';
import type { AbuseGuard } from '../ports/abuse';
import { CLOSE_DEVICE_LOCKED, CLOSE_RATE_LIMITED } from '../ports/wire';
import type { CapRefusal, Gatekeeper } from './Gatekeeper';

/** What one socket is held to: the guard the services ask, and the device's rate, which is the gatekeeper's, counted over all the device's sockets. */
export class ConnectionLimits {
  readonly guard: AbuseGuard;

  constructor(
    private readonly gate: Gatekeeper,
    readonly address: string,
    private readonly device: Id,
    private readonly seated: () => Promise<boolean>,
  ) {
    this.guard = {
      lookupAllowed: () => gate.lookupAllowed(device),
      recordMiss: () => gate.recordMiss(device),
      seatChangeAllowed: () => gate.seatChangeAllowed(device),
    };
  }

  /** Counts a message that has just arrived and says whether the device is still within its rate. The teacher's are never counted. */
  messageAllowed(isAdmin: boolean): boolean {
    return this.gate.messageAllowed(this.device, isAdmin);
  }

  /** The socket sent too fast: its device gets a strike. The code to close the socket with. */
  flooded(): number {
    return this.gate.flood(this.device) ? CLOSE_DEVICE_LOCKED : CLOSE_RATE_LIMITED;
  }

  /** Why one more live read is refused to this device, or null when it may open. */
  watchRefusal(isAdmin: boolean): Promise<CapRefusal | null> {
    return this.gate.refusal(this.gate.watchVerdict(this.device, isAdmin), this.seated);
  }
}
