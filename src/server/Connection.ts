import { isAdminSessionActive } from '../domain/adminAccess';
import type { Id } from '../domain/models';
import { CLOSE_POLICY, CLOSE_SESSION_ENDED, encode, parseClientMessage, type ClientMessage, type ServerMessage, type WireError } from '../ports/wire';
import { MAX_ATTACHMENT_CHARACTERS, MAX_WATCHES, messageLimitFor } from '../ports/limits';
import type { Unsubscribe } from '../ports/store';
import { SurfaceDispatcher, SurfaceError } from '../services/surfaceDispatch';
import { wireErrorOf } from '../services/errorRegistry';
import { LimitError } from '../services/LimitError';
import { LOCAL_ADDRESS } from './address';
import type { ConnectionLimits } from './ConnectionLimits';
import type { HubCore } from './HubCore';
import { ConnectionCaller } from './identity';
import { textHash } from './textHash';

/** What the hub needs of a socket; the platform's `WebSocket` has all of it. */
export interface HubSocket {
  send(text: string): void;
  close(code: number, reason: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

/** One live read, as kept in the socket's attachment so a hub that woke from hibernation can open it again. */
interface WatchSpec {
  id: number;
  service: string;
  method: string;
  args: unknown[];
}

/** Who a connection is, as fixed when its socket was accepted. */
export interface ConnectionOrigin {
  device: Id;
  adminExpiresAt: number | null;
  address: string;
}

/** What a socket keeps across the hub's sleep. A socket from before addresses were kept has none. */
interface Attachment {
  device: Id;
  adminExpiresAt: number | null;
  address?: string;
  watches: WatchSpec[];
}

/** An open live read, and a hash of the last value sent for it (not the value), so a value that did not change is not sent again. */
interface Entry {
  spec: WatchSpec;
  stop: Unsubscribe;
  lastHash: string;
}

/**
 * One page's connection: the caller fixed at its handshake, its open live reads, and the messages it sends and receives.
 * Its identity never changes. When the teacher's session on it ends, or she signs out of the device, the socket is closed and
 * the page opens a new one.
 */
export class Connection {
  private readonly watches = new Map<number, Entry>();
  private ended = false;

  private constructor(
    private readonly socket: HubSocket,
    private readonly core: HubCore,
    private readonly caller: ConnectionCaller,
    private readonly limits: ConnectionLimits,
  ) {}

  /** A new connection of a device; tells the page who it is. A teacher cookie that has already run out counts as none. */
  static open(socket: HubSocket, core: HubCore, { device, adminExpiresAt, address }: ConnectionOrigin): Connection {
    const stillAdmin = isAdminSessionActive(adminExpiresAt, core.now());
    const connection = new Connection(socket, core, new ConnectionCaller(device, stillAdmin ? adminExpiresAt : null, core.now), core.limitsFor(address, device));
    connection.save();
    connection.send({ type: 'hello', admin: connection.caller.isAdmin(), now: core.now() });
    return connection;
  }

  /** The connection of a socket that outlived the hub's memory: its live reads open again, without sending values the page already has. */
  static restore(socket: HubSocket, core: HubCore): Connection | null {
    const attached = socket.deserializeAttachment() as Attachment | null;
    if (!attached) return null;
    const address = attached.address ?? LOCAL_ADDRESS;
    const connection = new Connection(socket, core, new ConnectionCaller(attached.device, attached.adminExpiresAt, core.now), core.limitsFor(address, attached.device));
    if (connection.endIfExpired()) return connection;
    for (const spec of attached.watches) {
      const error = connection.open(spec, true);
      if (error) connection.send({ type: 'watch-refused', id: spec.id, error });
    }
    connection.save();
    return connection;
  }

  deviceId(): Id {
    return this.caller.deviceId();
  }

  address(): string {
    return this.limits.address;
  }

  openWatches(): number {
    return this.watches.size;
  }

  /**
   * Handles one message from the page, after the ones before it. A message that is not text, or is longer than this caller may
   * send, closes the socket; so does one that arrives faster than a page sends, and the address of that page gets a strike.
   */
  receive(message: string | ArrayBuffer): Promise<void> {
    if (!this.ended && !this.limits.messageAllowed()) {
      this.shutDown(this.limits.flooded(), 'too many messages');
      return Promise.resolve();
    }
    if (typeof message !== 'string' || message.length > messageLimitFor(this.caller.isAdmin())) {
      this.shutDown(CLOSE_POLICY, 'unsupported message');
      return Promise.resolve();
    }
    return this.core.exclusive(async () => {
      if (this.ended || this.endIfExpired()) return;
      const parsed = parseClientMessage(message, messageLimitFor(this.caller.isAdmin()));
      if (!parsed) return;
      if (parsed.type === 'call') await this.call(parsed);
      else if (parsed.type === 'watch') this.watch(parsed);
      else this.unwatch(parsed.id);
    });
  }

  /** Stops every live read of this connection; the socket itself is the platform's to close. */
  close(): void {
    for (const { stop } of this.watches.values()) stop();
    this.watches.clear();
  }

  /** Ends the connection and closes its socket: the page opens a new one and asks again under whatever identity its cookies now give. */
  shutDown(code: number, reason: string): void {
    this.ended = true;
    this.close();
    try {
      this.socket.close(code, reason);
    } catch {
      // The socket was already gone, which is what was wanted.
    }
  }

  /** If the teacher's session on this connection has run out: nothing more is sent or accepted, and the socket is closed. Says whether it had. */
  endIfExpired(): boolean {
    const expired = this.caller.adminExpiresAt !== null && !this.caller.isAdmin();
    if (expired) this.shutDown(CLOSE_SESSION_ENDED, 'session ended');
    return expired;
  }

  private async call({ id, service, method, args }: Extract<ClientMessage, { type: 'call' }>): Promise<void> {
    const outcome = await this.core.command(this.caller, this.limits.guard, service, method, args);
    this.send({ type: 'result', id, ...outcome });
  }

  private watch({ id, service, method, args }: Extract<ClientMessage, { type: 'watch' }>): void {
    const spec = { id, service, method, args };
    const error = this.refusalOf(spec) ?? this.open(spec, false);
    if (error) return this.send({ type: 'watch-refused', id, error });
    this.save();
  }

  /** Why a new live read is not opened before the services are even asked: its number is taken, this connection or the hub holds enough, or it would not fit the attachment. */
  private refusalOf(spec: WatchSpec): WireError | null {
    if (this.watches.has(spec.id)) return wireErrorOf(new SurfaceError('duplicate-watch'));
    if (this.watches.size >= MAX_WATCHES) return wireErrorOf(new SurfaceError('too-many-watches'));
    if (!this.limits.watchAllowed()) return wireErrorOf(new LimitError('watches'));
    return this.attachmentSizeWith(spec) > MAX_ATTACHMENT_CHARACTERS ? wireErrorOf(new SurfaceError('bad-arguments')) : null;
  }

  private attachmentSizeWith(spec: WatchSpec): number {
    try {
      const attachment = this.attachment();
      return JSON.stringify({ ...attachment, watches: [...attachment.watches, spec] }).length;
    } catch {
      return Infinity;
    }
  }

  /** Opens the live read; null when it is open, otherwise why the services refused it. The first values are sent unless `quiet`. */
  private open(spec: WatchSpec, quiet: boolean): WireError | null {
    let muted = quiet;
    const entry: Entry = { spec, stop: (): void => undefined, lastHash: '' };
    const services = this.core.watchingServices(this.caller, this.limits.guard, (error) => this.dropped(entry, error));
    try {
      entry.stop = new SurfaceDispatcher(services).watch(spec.service, spec.method, spec.args, (value) => this.push(entry, value, muted));
    } catch (error) {
      return this.core.describe(error);
    }
    muted = false;
    this.watches.set(spec.id, entry);
    return null;
  }

  /** The store gave up on this live read: the page is told, so that nothing waits for it. */
  private dropped(entry: Entry, error: unknown): void {
    if (this.watches.get(entry.spec.id) !== entry) return;
    this.watches.delete(entry.spec.id);
    this.send({ type: 'watch-refused', id: entry.spec.id, error: wireErrorOf(error) });
    this.save();
  }

  private push(entry: Entry, value: unknown, muted: boolean): void {
    if (this.ended || this.endIfExpired()) return;
    const text = encode({ type: 'value', id: entry.spec.id, value });
    const hash = textHash(text);
    if (hash === entry.lastHash) return;
    entry.lastHash = hash;
    if (!muted) this.sendText(text);
  }

  private unwatch(id: number): void {
    this.watches.get(id)?.stop();
    if (this.watches.delete(id)) this.save();
  }

  private attachment(): Attachment {
    return { device: this.caller.deviceId(), adminExpiresAt: this.caller.adminExpiresAt, address: this.limits.address, watches: [...this.watches.values()].map(({ spec }) => spec) };
  }

  private save(): void {
    if (!this.ended) this.socket.serializeAttachment(this.attachment());
  }

  private send(message: ServerMessage): void {
    if (!this.ended) this.sendText(encode(message));
  }

  /** A socket that has gone cannot take a message; its reads are closed so that no later change tries again, and no other reader's turn is lost. */
  private sendText(text: string): void {
    try {
      this.socket.send(text);
    } catch {
      this.close();
    }
  }
}
