import { isHeldToLimits, socketVerdict, watchVerdict, type CapVerdict, type SocketCounts } from '../domain/abuse';
import type { Id } from '../domain/models';
import { MemoryLocks } from '../infrastructure/MemoryLocks';
import { DEVICE_FLOODS, DEVICE_MESSAGES, DEVICE_MISSES, DEVICE_SEAT_CHANGES, SOCKET_CAPS, WATCH_CAPS } from '../ports/limits';
import { ConnectionLimits } from './ConnectionLimits';
import { KeyedWindows } from './KeyedWindows';
import { Offences } from './Offences';

/** The live reads open right now. */
export interface OpenReads {
  inHub(): number;
  ofDevice(device: Id): number;
}

/** Which cap refused a caller: the device's own, or a shared one that only a seated student is let past. */
export type CapRefusal = 'device' | 'shared';

/**
 * The hub's one memory of how its devices have behaved: messages, floods, wrong class codes and seat changes, counted per device; the locks
 * those produce are kept in memory too, since a device sheds them by dropping its cookie. It knows devices, sockets and counts, and nothing of classes: whether a student is seated
 * is asked of the services by the caller. Network addresses are not its business (sign-in and new devices have their own).
 */
export class Gatekeeper {
  private readonly floods: Offences;
  private readonly misses: Offences;
  private readonly seatChanges: KeyedWindows;
  private readonly messages: KeyedWindows;
  private readonly locks = new MemoryLocks();

  constructor(
    private readonly now: () => number,
    private readonly open: OpenReads,
  ) {
    this.floods = new Offences('door', DEVICE_FLOODS, this.locks, now);
    this.misses = new Offences('lookups', DEVICE_MISSES, this.locks, now);
    this.seatChanges = new KeyedWindows(DEVICE_SEAT_CHANGES, now);
    this.messages = new KeyedWindows(DEVICE_MESSAGES, now);
  }

  /** What one socket is held to; `seated` tells whether its device is let in to a running class. */
  limitsFor(address: string, device: Id, seated: () => Promise<boolean>): ConnectionLimits {
    return new ConnectionLimits(this, address, device, seated);
  }

  /** Whether a request from this device is refused at the door. The teacher is never turned away. */
  turnsAway(device: Id, isAdmin: boolean): boolean {
    return isHeldToLimits(isAdmin) && this.floods.isLocked(device);
  }

  socketVerdict(open: SocketCounts, isAdmin: boolean): CapVerdict {
    return socketVerdict(open, SOCKET_CAPS, isAdmin);
  }

  watchVerdict(device: Id, isAdmin: boolean): CapVerdict {
    return watchVerdict({ ofDevice: this.open.ofDevice(device), inHub: this.open.inHub() }, WATCH_CAPS, isAdmin);
  }

  /** Why a cap refuses, or null when it lets the caller in; `seated` is asked only when a shared cap is full. */
  async refusal(verdict: CapVerdict, seated: () => Promise<boolean>): Promise<CapRefusal | null> {
    if (verdict === 'admit') return null;
    if (verdict === 'refuse') return 'device';
    return (await seated()) ? null : 'shared';
  }

  /** Counts a message that has just arrived from the device, over all its sockets, and says whether the device is still within its rate. */
  messageAllowed(device: Id): boolean {
    this.messages.record(device);
    return !this.messages.isOver(device);
  }

  /** Counts a strike against the device; the last one the rule allows locks it. Says whether this strike locked it. */
  flood(device: Id): boolean {
    return this.floods.record(device);
  }

  lookupAllowed(device: Id): boolean {
    return !this.misses.isLocked(device);
  }

  recordMiss(device: Id): void {
    this.misses.record(device);
  }

  /** Counts one seat change of the device and says whether it fit; one that did not fit is not counted. */
  seatChangeAllowed(device: Id): boolean {
    if (!this.seatChanges.hasRoom(device)) return false;
    this.seatChanges.record(device);
    return true;
  }

  /** Forgets what has run out: called by the hub's alarm. */
  prune(): void {
    this.locks.prune(this.now());
    this.floods.prune();
    this.misses.prune();
    this.seatChanges.prune();
    this.messages.prune();
  }
}
