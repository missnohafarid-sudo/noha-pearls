import { adminExpiryFrom, isAdminSessionActive, secretsHonoured } from '../domain/adminAccess';
import type { AdminSessionTable } from '../infrastructure/sql/adminSessions';
import { AdminCookie, hasDevelopmentValue, type AdminSecrets } from './identity';
import { randomToken } from './webCrypto';

/** An open session of the teacher: it ends at the moment its row names, or when it is ended. */
export interface AdminSession {
  readonly id: string;
  readonly expiresAt: number;
}

/**
 * The teacher's sessions. A sign-in opens one (a row with a random id and its end); the cookie carries the signed id and counts only
 * while its row exists and has not run out, so signing out, which removes the row, ends it for every device that holds the cookie.
 * Secrets that hold a public development value are honoured only for a request from this computer: elsewhere there is no admin.
 */
export class AdminSessions {
  private constructor(
    private readonly cookie: AdminCookie,
    private readonly table: AdminSessionTable,
    private readonly hasDevelopmentValue: boolean,
    private readonly now: () => number,
  ) {}

  static async from(secrets: AdminSecrets, table: AdminSessionTable, now: () => number): Promise<AdminSessions> {
    return new AdminSessions(await AdminCookie.from(secrets), table, await hasDevelopmentValue(secrets), now);
  }

  /** Whether the secrets count for a request from here (`isLocal`: from this computer). */
  honoured(isLocal: boolean): boolean {
    return secretsHonoured(this.hasDevelopmentValue, isLocal);
  }

  /** Opens a session for a sign-in that succeeded; the cookie's value is what the browser keeps. */
  async open(): Promise<{ session: AdminSession; cookie: string }> {
    const session = { id: randomToken(), expiresAt: adminExpiryFrom(this.now()) };
    this.table.add(session.id, session.expiresAt);
    return { session, cookie: await this.cookie.sign(session.id) };
  }

  /** The session a cookie names, if it was signed by this hub, its row is still here and has not run out, and the secrets are honoured here. */
  async verified(value: string | undefined, isLocal: boolean): Promise<AdminSession | null> {
    if (!this.honoured(isLocal)) return null;
    const id = await this.cookie.sessionIdOf(value);
    const expiresAt = id === null ? null : this.table.expiryOf(id);
    return id !== null && isAdminSessionActive(expiresAt, this.now()) ? { id, expiresAt: expiresAt as number } : null;
  }

  /** Whether the session's row is still here and has not run out: asked right where the teacher's authority is used, after any wait since `verified`. */
  isOpen(session: AdminSession): boolean {
    return isAdminSessionActive(this.table.expiryOf(session.id), this.now());
  }

  end(session: AdminSession): void {
    this.table.remove(session.id);
  }
}
