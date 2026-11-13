import { totpCode } from '../src/infrastructure/totp';
import { encode, parseServerMessage, type CallOutcome, type ClientMessage, type ServerMessage } from '../src/ports/wire';
import { LOCAL_ADMIN_SECRETS } from '../vite.config';

/** A device for the tests: its own cookie jar, plain requests with `fetch`, and live sockets with `WebSocket`. */

export const rightPassword = (): string => LOCAL_ADMIN_SECRETS.ADMIN_PASSWORD;
export const rightCode = (): Promise<string> => totpCode(LOCAL_ADMIN_SECRETS.ADMIN_TOTP_SECRET, Date.now());

/** A code that is wrong now and in the neighbouring time steps the hub also accepts. */
export async function wrongCode(): Promise<string> {
  const accepted = new Set<string>();
  for (const offset of [-60_000, 0, 60_000]) accepted.add(await totpCode(LOCAL_ADMIN_SECRETS.ADMIN_TOTP_SECRET, Date.now() + offset));
  for (let n = 100_000; ; n++) if (!accepted.has(String(n))) return String(n);
}

type SocketWithHeaders = new (url: string, options: { headers: Record<string, string> }) => WebSocket;

export class LiveSocket {
  readonly received: ServerMessage[] = [];
  /** Every byte the hub sent on this socket. */
  raw = '';
  /** How the hub closed this socket, once it has. */
  closedWith: { code: number; reason: string } | null = null;
  private waiters: (() => void)[] = [];
  private nextId = 1;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('close', (event) => {
      this.closedWith = { code: event.code, reason: event.reason };
      this.waiters.splice(0).forEach((wake) => wake());
    });
    socket.addEventListener('message', (event) => {
      const text = String(event.data);
      this.raw += text;
      const message = parseServerMessage(text);
      if (message) this.received.push(message);
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  static async open(origin: string, cookie: string, extraHeaders: Record<string, string> = {}): Promise<LiveSocket> {
    const socket = new (WebSocket as unknown as SocketWithHeaders)(`${origin.replace('http', 'ws')}/api/live`, { headers: { Cookie: cookie, ...extraHeaders } });
    const live = new LiveSocket(socket);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve());
      socket.addEventListener('error', () => reject(new Error('the socket was refused')));
    });
    await live.until(() => live.received.some((message) => message.type === 'hello'));
    return live;
  }

  /**
   * Whether the hub's close has reached this client. The client then answers it and only reports `closedWith` when the platform
   * ends the connection, which the local runtime does about ten seconds later, so that is no measure of how fast the hub closed.
   */
  get closeReceived(): boolean {
    return this.socket.readyState >= WebSocket.CLOSING;
  }

  hello(): Extract<ServerMessage, { type: 'hello' }> {
    return this.received.find((message): message is Extract<ServerMessage, { type: 'hello' }> => message.type === 'hello')!;
  }

  /** Waits until `done` holds, checking after each message. */
  async until(done: () => boolean, ms = 10_000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!done()) {
      if (Date.now() > deadline) throw new Error('timed out waiting for the hub');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  private send(message: ClientMessage): void {
    this.socket.send(encode(message));
  }

  /** Sends exactly this text (or bytes), whatever it is. */
  sendRaw(data: string | ArrayBuffer): void {
    this.socket.send(data);
  }

  async call(service: string, method: string, ...args: unknown[]): Promise<CallOutcome> {
    const id = this.nextId++;
    this.send({ type: 'call', id, service, method, args });
    await this.until(() => this.received.some((message) => message.type === 'result' && message.id === id));
    const result = this.received.find((message): message is Extract<ServerMessage, { type: 'result' }> => message.type === 'result' && message.id === id)!;
    return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error };
  }

  /** Opens a live read and returns its id; its values are in `valuesOf`. */
  watch(service: string, method: string, ...args: unknown[]): number {
    const id = this.nextId++;
    this.send({ type: 'watch', id, service, method, args });
    return id;
  }

  valuesOf(id: number): unknown[] {
    return this.received.flatMap((message) => (message.type === 'value' && message.id === id ? [message.value] : []));
  }

  refusalOf(id: number) {
    return this.received.find((message): message is Extract<ServerMessage, { type: 'watch-refused' }> => message.type === 'watch-refused' && message.id === id);
  }

  async firstValue<T>(service: string, method: string, ...args: unknown[]): Promise<T> {
    const id = this.watch(service, method, ...args);
    await this.until(() => this.valuesOf(id).length > 0);
    return this.valuesOf(id)[0] as T;
  }

  close(): void {
    this.socket.close();
  }
}

export class Device {
  private readonly jar = new Map<string, string>();

  constructor(
    private readonly origin: () => string,
    private readonly address?: string,
  ) {}

  get cookie(): string {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  cookieNamed(name: string): string | undefined {
    return this.jar.get(name);
  }

  forget(name: string): void {
    this.jar.delete(name);
  }

  async post(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string; setCookies: string[] }> {
    const response = await fetch(`${this.origin()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: this.cookie, ...(this.address ? { 'CF-Connecting-IP': this.address } : {}), ...headers },
      body: JSON.stringify(body ?? {}),
    });
    const setCookies = response.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair] = line.split(';');
      const at = pair.indexOf('=');
      if (/max-age=0/i.test(line)) this.jar.delete(pair.slice(0, at));
      else this.jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return { status: response.status, text: await response.text(), setCookies };
  }

  async hello(): Promise<{ admin: boolean; now: number }> {
    return JSON.parse((await this.post('/api/hello')).text);
  }

  async signIn(password: string, code: string): Promise<boolean> {
    return (JSON.parse((await this.post('/api/sign-in', { password, code })).text) as { ok: boolean }).ok;
  }

  signOut(): Promise<unknown> {
    return this.post('/api/sign-out');
  }

  open(): Promise<LiveSocket> {
    return LiveSocket.open(this.origin(), this.cookie, this.address ? { 'CF-Connecting-IP': this.address } : {});
  }
}
