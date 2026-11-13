import type { CallOutcome, WireError } from './wire';
import type { Unsubscribe } from './store';

/**
 * The page's way to the services that run on the hub: one command and one live read, both by name.
 * A call never rejects; what went wrong is in its outcome. A watch delivers each full value again after a reconnect.
 */
export interface RemoteLink {
  call(service: string, method: string, args: readonly unknown[]): Promise<CallOutcome>;
  /** `onRefused` hears why the hub refused or dropped the watch; the watch is then over, and a reconnect does not open it again. */
  watch(service: string, method: string, args: readonly unknown[], listener: (value: unknown) => void, onRefused?: (error: WireError) => void): Unsubscribe;
}

/** Why the hub turned the page away: it sent too fast, this device is refused for a while, or this network has been given all the new devices it may have for now. */
export type TurnedAway = 'rate' | 'device' | 'network';

/** Whether the page can reach what holds its data; the interface shows a notice while it cannot. */
export interface ConnectionStatus {
  isUp(): boolean;
  /** While the page is down because the hub turned it away: why. Otherwise null. */
  turnedAway(): TurnedAway | null;
  subscribe(listener: () => void): Unsubscribe;
}

/**
 * What a screen hands to a live read: the function that takes each value, and optionally, as a property, the function that hears
 * why the read was refused or dropped. The services that run in the browser itself never refuse and ignore the property.
 */
export type RefusableListener<T> = ((value: T) => void) & { onRefused?: (error: Error) => void };
