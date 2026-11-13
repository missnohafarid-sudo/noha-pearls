import type { AdminCredentials, AuthGateway } from '../../ports/auth';
import type { Unsubscribe } from '../../ports/store';
import type { SignInResult } from '../../ports/auth';
import { HELLO_PATH, SIGN_IN_PATH, SIGN_OUT_PATH, type Hello, type SignInAnswer } from '../../ports/wire';

export type PostJson = (path: string, body?: unknown) => Promise<unknown>;

/**
 * Who this page is to the hub, as the hub last said: whether it is the admin, and what time the hub's clock shows.
 * Signing in or out asks the hub with a plain request, then has the socket reopened so the new cookies apply.
 */
export class RemoteSession implements AuthGateway {
  private admin = false;
  private offset = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly post: PostJson,
    private readonly reopenSocket: () => Promise<void>,
    private readonly localNow: () => number = Date.now,
  ) {}

  /** Asks the hub who this device is; the hub gives it its cookie if it has none. */
  async hello(): Promise<void> {
    this.learn((await this.post(HELLO_PATH)) as Hello);
  }

  learn({ admin, now }: Hello): void {
    this.offset = now - this.localNow();
    if (admin === this.admin) return;
    this.admin = admin;
    this.listeners.forEach((listener) => listener());
  }

  /** The hub's time, for the rules that read the clock. */
  now(): number {
    return this.localNow() + this.offset;
  }

  async signIn(credentials: AdminCredentials): Promise<SignInResult> {
    const answer = (await this.post(SIGN_IN_PATH, credentials)) as SignInAnswer;
    if (!answer.ok) return answer.closed ? 'closed' : 'wrong';
    await this.reopenSocket();
    return 'signed-in';
  }

  async signOut(): Promise<void> {
    await this.post(SIGN_OUT_PATH);
    await this.reopenSocket();
  }

  isAdmin(): boolean {
    return this.admin;
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
