import { toAsciiDigits } from '../domain/digits';
import type { AdminCredentials, AuthGateway } from '../ports/auth';
import type { KeyValueStorage } from '../ports/storage';
import type { Unsubscribe } from '../ports/store';
import { verifyTotp } from './totp';

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PrototypeSecrets {
  passwordSha256: string | undefined;
  totpSecret: string | undefined;
}

/**
 * PROTOTYPE ONLY. Compares the typed password with a hash, and the typed code
 * with a TOTP secret, both baked in at build time. It hides the admin tools;
 * it protects nothing, because a static page cannot keep a secret. Production
 * swaps this for a gateway that asks the hosted backend to verify both (see
 * docs/PLAN.md, "Admin access").
 *
 * Unless both secrets are configured, sign-in always fails.
 */
export class PrototypeAuthGateway implements AuthGateway {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly secrets: PrototypeSecrets,
    private readonly memory: KeyValueStorage,
    private readonly flagKey: string,
    private readonly now: () => number = Date.now,
  ) {}

  async signIn({ password, code }: AdminCredentials): Promise<boolean> {
    const { passwordSha256, totpSecret } = this.secrets;
    if (!passwordSha256 || !totpSecret) return false;
    const passwordOk = (await sha256Hex(password)) === passwordSha256.toLowerCase();
    const codeOk = await verifyTotp(totpSecret, toAsciiDigits(code), this.now());
    const matches = passwordOk && codeOk;
    if (matches) {
      this.memory.setItem(this.flagKey, '1');
      this.notify();
    }
    return matches;
  }

  async signOut(): Promise<void> {
    this.memory.removeItem(this.flagKey);
    this.notify();
  }

  isAdmin(): boolean {
    return this.memory.getItem(this.flagKey) === '1';
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
