import { isLockedAt, socketAdmitted, type SocketCounts } from '../domain/abuse';
import { isAdminSessionActive } from '../domain/adminAccess';
import type { Id } from '../domain/models';
import type { AddressLocks } from '../infrastructure/sql/addressLocks';
import { ADDRESS_LOCK_MS, ADDRESS_MISSES, ADDRESS_STRIKES, DEVICE_JOINS, LOOKUP_LOCK_MS, SCHOOL_MISSES, SOCKET_CAPS, WATCHES_PER_HUB } from '../ports/limits';
import { ConnectionLimits } from './ConnectionLimits';
import { KeyedWindows } from './KeyedWindows';

const WHOLE_SCHOOL = 'school';

/**
 * The hub's one memory of how its visitors have behaved: strikes, wrong class codes and joins, counted in memory; and the
 * addresses it refuses, which are kept in the database. It knows addresses, devices, sockets and counts, and nothing of classes.
 */
export class Gatekeeper {
  private readonly strikes: KeyedWindows;
  private readonly misses: KeyedWindows;
  private readonly schoolMisses: KeyedWindows;
  private readonly joins: KeyedWindows;
  private readonly lookupLockedUntil = new Map<string, number>();

  /** `openWatches` says how many live reads are open on the whole hub right now. */
  constructor(
    private readonly locks: AddressLocks,
    private readonly now: () => number,
    private readonly openWatches: () => number,
  ) {
    this.strikes = new KeyedWindows(ADDRESS_STRIKES, now);
    this.misses = new KeyedWindows(ADDRESS_MISSES, now);
    this.schoolMisses = new KeyedWindows(SCHOOL_MISSES, now);
    this.joins = new KeyedWindows(DEVICE_JOINS, now);
  }

  /** What one socket is held to. */
  limitsFor(address: string, device: Id): ConnectionLimits {
    return new ConnectionLimits(this, address, device, this.now);
  }

  /** Whether a request from this address is refused at the door. The teacher, signed in, is let in from a locked address. */
  turnsAway(address: string, adminExpiresAt: number | null): boolean {
    return this.locks.isLocked(address, this.now()) && !isAdminSessionActive(adminExpiresAt, this.now());
  }

  admits(open: SocketCounts): boolean {
    return socketAdmitted(open, SOCKET_CAPS);
  }

  watchAllowed(): boolean {
    return this.openWatches() < WATCHES_PER_HUB;
  }

  /** Counts a strike against the address; the last one the limit allows locks it. Says whether this strike locked it. */
  strike(address: string): boolean {
    this.strikes.record(address);
    if (this.strikes.hasRoom(address)) return false;
    this.strikes.clear(address);
    this.locks.lock(address, this.now() + ADDRESS_LOCK_MS);
    return true;
  }

  lookupAllowed(address: string): boolean {
    return !isLockedAt(this.lookupLockedUntil.get(address), this.now()) && !this.schoolMisses.isOver(WHOLE_SCHOOL);
  }

  recordMiss(address: string): void {
    this.misses.record(address);
    this.schoolMisses.record(WHOLE_SCHOOL);
    if (!this.misses.isOver(address)) return;
    this.misses.clear(address);
    this.lookupLockedUntil.set(address, this.now() + LOOKUP_LOCK_MS);
  }

  /** Counts one join of the device and says whether it fit; a join that did not fit is not counted. */
  joinAllowed(device: Id): boolean {
    if (!this.joins.hasRoom(device)) return false;
    this.joins.record(device);
    return true;
  }

  /** Forgets what has run out: called by the hub's alarm. */
  prune(): void {
    this.locks.prune(this.now());
    for (const windows of [this.strikes, this.misses, this.schoolMisses, this.joins]) windows.prune();
    for (const [address, until] of this.lookupLockedUntil) if (!isLockedAt(until, this.now())) this.lookupLockedUntil.delete(address);
  }
}
