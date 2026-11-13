import type { Id } from '../domain/models';
import { isTotpSecret } from '../infrastructure/totp';
import type { Caller } from '../ports/caller';
import { isAdminSessionActive, MIN_PASSWORD_LENGTH, usesDevelopmentValue } from '../domain/adminAccess';
import { constantTimeEqual, hmacHex, hmacKey, sha256, sha256Hex } from './webCrypto';
import type { AdminSession, AdminSessions } from './AdminSessions';
import { isLocalRequest } from './address';
import { parseCookies } from './cookies';
import type { DeviceTokens } from './DeviceTokens';

export const DEVICE_COOKIE = 'noha_device';
export const ADMIN_COOKIE = 'noha_admin';

/** The two secrets the admin sign-in rests on. */
export interface AdminSecrets {
  password: string;
  totpSecret: string;
}

/** The secrets from the Worker's environment, or null unless both are there and usable: then every sign-in is refused. */
export function adminSecretsOf(env: { ADMIN_PASSWORD?: unknown; ADMIN_TOTP_SECRET?: unknown }): AdminSecrets | null {
  const { ADMIN_PASSWORD: password, ADMIN_TOTP_SECRET: totpSecret } = env;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return null;
  return typeof totpSecret === 'string' && isTotpSecret(totpSecret) ? { password, totpSecret } : null;
}

/** Whether either secret is one of the development values, which are public: a hub holding one honours the secrets only on this computer. */
export async function hasDevelopmentValue({ password, totpSecret }: AdminSecrets): Promise<boolean> {
  const [passwordHash, totpSecretHash] = await Promise.all([sha256Hex(password), sha256Hex(totpSecret)]);
  return usesDevelopmentValue({ password: passwordHash, totpSecret: totpSecretHash });
}

/** The id the services know a device by: a hash of its token, so no id seen by a teacher can be turned back into the token. */
export async function deviceIdOf(token: string): Promise<Id> {
  return (await sha256Hex(`noha-pearls/device/v1\u0000${token}`)).slice(0, 32);
}

/** Signs and checks the teacher's cookie, which names a session and nothing else. Its key comes from both secrets, so replacing either one signs everyone out. */
export class AdminCookie {
  private constructor(private readonly key: CryptoKey) {}

  static async from(secrets: AdminSecrets): Promise<AdminCookie> {
    return new AdminCookie(await hmacKey(await sha256(`noha-pearls/admin-cookie/v2\u0000${secrets.password.length}:${secrets.password}\u0000${secrets.totpSecret}`)));
  }

  /** The cookie's value: the session's id, and a signature over it. */
  async sign(sessionId: string): Promise<string> {
    return `${sessionId}.${await hmacHex(this.key, `admin-session:${sessionId}`)}`;
  }

  /** The session id, if the value is one this hub signed; otherwise null. */
  async sessionIdOf(value: string | undefined): Promise<string | null> {
    const match = /^([A-Za-z0-9_-]{43})\.([0-9a-f]{64})$/.exec(value ?? '');
    if (!match) return null;
    return (await constantTimeEqual(match[2], await hmacHex(this.key, `admin-session:${match[1]}`))) ? match[1] : null;
  }
}

/** What a request's cookies say of who sent it. */
export interface RequestIdentity {
  /** The device's token; null when the request carries none that the hub issued. */
  deviceToken: string | null;
  /** The id the services know that device by. */
  device: Id | null;
  /** The teacher's session, when the request carries a cookie for one that is still open and that this hub honours here. */
  admin: AdminSession | null;
}

export async function identityOf(request: Request, sessions: AdminSessions | null, devices: DeviceTokens): Promise<RequestIdentity> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const [deviceToken, admin] = await Promise.all([devices.verified(cookies.get(DEVICE_COOKIE)), sessions ? sessions.verified(cookies.get(ADMIN_COOKIE), isLocalRequest(request)) : null]);
  return { deviceToken, device: deviceToken === null ? null : await deviceIdOf(deviceToken), admin };
}

/** The caller of one connection, fixed when it was made. Whether it is still the admin is asked of the clock each time. */
export class ConnectionCaller implements Caller {
  constructor(
    private readonly device: Id,
    private readonly admin: AdminSession | null,
    private readonly now: () => number,
  ) {}

  isAdmin(): boolean {
    return this.admin !== null && isAdminSessionActive(this.admin.expiresAt, this.now());
  }

  /** The teacher's session this caller came with, ended or not; null for a visitor. */
  session(): AdminSession | null {
    return this.admin;
  }

  sessionId(): string | null {
    return this.admin?.id ?? null;
  }

  /** Whether the caller came with a teacher's session that has run out since. */
  sessionRanOut(): boolean {
    return this.admin !== null && !this.isAdmin();
  }

  deviceId(): Id {
    return this.device;
  }
}

/** The hub's own jobs, such as the yearly clearing, run as this caller. */
export const SYSTEM_CALLER: Caller = { isAdmin: () => true, deviceId: () => 'system' };
