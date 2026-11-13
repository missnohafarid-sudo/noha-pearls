import { retryDelay } from '../../domain/reconnect';
import { KEEP_ALIVE_MS, RECONNECT } from '../../ports/limits';
import type { ConnectionStatus, RemoteLink, TurnedAway } from '../../ports/remote';
import type { Unsubscribe } from '../../ports/store';
import { CLOSE_ADDRESS_LOCKED, CLOSE_RATE_LIMITED, CONNECTION_LOST, encode, parseServerMessage, PING, STATUS_TOO_MANY, type CallOutcome, type ClientMessage, type Hello, type WireError } from '../../ports/wire';
import { RequestRefused } from './RequestRefused';

/** What the connection needs of a socket and of the page around it; the browser's versions are in `browserSocket.ts`. */
export interface SocketHandlers {
  message(text: string): void;
  /** `code` is how the hub closed the socket, when it did. */
  closed(code?: number): void;
}
export interface OpenSocket {
  send(text: string): void;
  close(): void;
}
export type SocketFactory = (handlers: SocketHandlers) => OpenSocket;

export interface Timers {
  after(ms: number, work: () => void): () => void;
  every(ms: number, work: () => void): () => void;
  random(): number;
}

export interface LiveConnectionDeps {
  openSocket: SocketFactory;
  /** Asked before each socket is opened: the plain request that gives the device its cookie. */
  prepare(): Promise<void>;
  onHello(hello: Hello): void;
  timers: Timers;
}

const closeReasons: Readonly<Record<number, TurnedAway>> = { [CLOSE_RATE_LIMITED]: 'rate', [CLOSE_ADDRESS_LOCKED]: 'address' };

type Phase = 'connecting' | 'open' | 'waiting';

interface Watch {
  service: string;
  method: string;
  args: readonly unknown[];
  listener: (value: unknown) => void;
  onRefused?: (error: WireError) => void;
}

const lost: CallOutcome = { ok: false, error: { name: CONNECTION_LOST } };

/**
 * The page's one socket. It opens after the plain "hello" request, answers every call, delivers every live value, opens again
 * with backoff when it drops (sending every live read again), and says whether it is up. A call made while it is opening waits;
 * one made while it is down, or in flight when it drops, comes back as a lost connection.
 */
export class LiveConnection implements RemoteLink, ConnectionStatus {
  private phase: Phase = 'connecting';
  private up = true;
  private socket: OpenSocket | null = null;
  private generation = 0;
  private nextId = 1;
  private failures = 0;
  private reason: TurnedAway | null = null;
  private cancelRetry: (() => void) | null = null;
  private stopKeepAlive: (() => void) | null = null;
  private awaitingPong = false;
  private readonly calls = new Map<number, (outcome: CallOutcome) => void>();
  private readonly waiting: { send(): void; fail(): void }[] = [];
  private readonly watches = new Map<number, Watch>();
  private readonly listeners = new Set<() => void>();
  private readonly helloWaiters: (() => void)[] = [];

  constructor(private readonly deps: LiveConnectionDeps) {}

  isUp(): boolean {
    return this.up;
  }

  turnedAway(): TurnedAway | null {
    return this.reason;
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Closes the socket, if there is one, and opens a new one at once, so that the cookies the page holds now apply. Resolves when the new one has said hello or has failed to. */
  restart(): Promise<void> {
    const done = new Promise<void>((resolve) => this.helloWaiters.push(resolve));
    this.drop();
    void this.connect();
    return done;
  }

  call(service: string, method: string, args: readonly unknown[]): Promise<CallOutcome> {
    if (this.phase === 'waiting') return Promise.resolve(lost);
    return new Promise((resolve) => {
      const send = () => {
        const id = this.nextId++;
        this.calls.set(id, resolve);
        this.send({ type: 'call', id, service, method, args: [...args] });
      };
      if (this.phase === 'open') send();
      else this.waiting.push({ send, fail: () => resolve(lost) });
    });
  }

  watch(service: string, method: string, args: readonly unknown[], listener: (value: unknown) => void, onRefused?: (error: WireError) => void): Unsubscribe {
    const id = this.nextId++;
    this.watches.set(id, { service, method, args, listener, onRefused });
    if (this.phase === 'open') this.sendWatch(id);
    return () => {
      if (this.watches.delete(id) && this.phase === 'open') this.send({ type: 'unwatch', id });
    };
  }

  private async connect(): Promise<void> {
    const mine = ++this.generation;
    this.phase = 'connecting';
    try {
      await this.deps.prepare();
    } catch (error) {
      if (mine === this.generation) this.failed(error instanceof RequestRefused && error.status === STATUS_TOO_MANY ? 'address' : null);
      return;
    }
    if (mine !== this.generation) return;
    this.socket = this.deps.openSocket({
      message: (text) => mine === this.generation && this.receive(text),
      closed: (code) => mine === this.generation && this.failed(code === undefined ? null : (closeReasons[code] ?? null)),
    });
  }

  private receive(text: string): void {
    this.awaitingPong = false;
    const message = parseServerMessage(text);
    if (!message) return;
    if (message.type === 'hello') return this.phase === 'open' ? undefined : this.opened(message);
    if (message.type === 'value') this.watches.get(message.id)?.listener(message.value);
    else if (message.type === 'watch-refused') this.refused(message.id, message.error);
    else this.finish(message.id, message.ok ? { ok: true, value: message.value } : { ok: false, error: message.error });
  }

  private refused(id: number, error: WireError): void {
    const watch = this.watches.get(id);
    this.watches.delete(id);
    watch?.onRefused?.(error);
  }

  private finish(id: number, outcome: CallOutcome): void {
    const resolve = this.calls.get(id);
    this.calls.delete(id);
    resolve?.(outcome);
  }

  private opened(hello: Hello): void {
    this.deps.onHello(hello);
    this.phase = 'open';
    this.failures = 0;
    this.setState(true, null);
    for (const id of this.watches.keys()) this.sendWatch(id);
    this.waiting.splice(0).forEach(({ send }) => send());
    this.helloWaiters.splice(0).forEach((resolve) => resolve());
    this.stopKeepAlive ??= this.deps.timers.every(KEEP_ALIVE_MS, () => this.keepAlive());
  }

  /** Every 30 seconds a ping; a socket that answered nothing at all since the last one is taken as gone. */
  private keepAlive(): void {
    if (this.awaitingPong) return this.failedAndClose();
    this.awaitingPong = true;
    this.socket?.send(PING);
  }

  private failedAndClose(): void {
    this.generation++;
    this.socket?.close();
    this.failed(null);
  }

  /** The socket is gone or could not open: the page waits, and says why if the hub turned it away, then tries again. */
  private failed(reason: TurnedAway | null): void {
    this.release();
    this.waiting.splice(0).forEach(({ fail }) => fail());
    this.helloWaiters.splice(0).forEach((resolve) => resolve());
    this.phase = 'waiting';
    this.setState(false, reason);
    this.cancelRetry = this.deps.timers.after(retryDelay(this.failures++, reason !== null, this.deps.timers.random(), RECONNECT), () => void this.connect());
  }

  /** Forgets the socket without treating it as a failure: the caller opens the next one. */
  private drop(): void {
    this.generation++;
    this.socket?.close();
    this.release();
  }

  private release(): void {
    this.socket = null;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.stopKeepAlive?.();
    this.stopKeepAlive = null;
    this.awaitingPong = false;
    for (const resolve of this.calls.values()) resolve(lost);
    this.calls.clear();
  }

  private sendWatch(id: number): void {
    const watch = this.watches.get(id);
    if (watch) this.send({ type: 'watch', id, service: watch.service, method: watch.method, args: [...watch.args] });
  }

  private send(message: ClientMessage): void {
    this.socket?.send(encode(message));
  }

  private setState(up: boolean, reason: TurnedAway | null): void {
    if (this.up === up && this.reason === reason) return;
    this.up = up;
    this.reason = reason;
    this.listeners.forEach((listener) => listener());
  }
}
