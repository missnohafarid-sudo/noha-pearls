import type { Id } from '../domain/models';
import { isTotpSecret } from '../infrastructure/totp';
import type { Caller } from '../ports/caller';
import { DEVELOPMENT_SECRET_HASHES, isAdminSessionActive, MIN_PASSWORD_LENGTH } from '../domain/adminAccess';
import { constantTimeEqual, hmacHex, hmacKey, sha256, sha256Hex } from './webCrypto';
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

/** Whether these are the development secrets, which are public: a deployed hub must not take them as its own. */
export async function isDevelopmentPair({ password, totpSecret }: AdminSecrets): Promise<boolean> {
  const [passwordHash, totpHash] = await Promise.all([sha256Hex(password), sha256Hex(totpSecret)]);
  return passwordHash === DEVELOPMENT_SECRET_HASHES.password && totpHash === DEVELOPMENT_SECRET_HASHES.totpSecret;
}

/** The id the services know a device by: a hash of its token, so no id seen by a teacher can be turned back into the token. */
export async function deviceIdOf(token: string): Promise<Id> {
  return (await sha256Hex(`noha-pearls/device/v1\u0000${token}`)).slice(0, 32);
}

/** Signs and checks the teacher's cookie. Its key comes from both secrets, so replacing either one signs everyone out. */
export class AdminCookie {
  private constructor(private readonly key: CryptoKey) {}

  static async from(secrets: AdminSecrets | null): Promise<AdminCookie | null> {
    if (!secrets) return null;
    return new AdminCookie(await hmacKey(await sha256(`noha-pearls/admin-cookie/v1\u0000${secrets.password.length}:${secrets.password}\u0000${secrets.totpSecret}`)));
  }

  /** The cookie's value: the moment it stops counting, and a signature over that moment. */
  async sign(expiresAt: number): Promise<string> {
    return `${expiresAt}.${await hmacHex(this.key, `admin:${expiresAt}`)}`;
  }

  /** The moment the cookie stops counting, if the value is one this hub signed; otherwise null. */
  async expiryOf(value: string | undefined): Promise<number | null> {
    const match = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(value ?? '');
    if (!match) return null;
    const expiresAt = Number(match[1]);
    return (await constantTimeEqual(match[2], await hmacHex(this.key, `admin:${expiresAt}`))) ? expiresAt : null;
  }
}

/** What a request's cookies say of who sent it. */
export interface RequestIdentity {
  /** The device's token; null when the request carries none that the hub issued. */
  deviceToken: string | null;
  adminExpiresAt: number | null;
}

export async function identityOf(headers: Headers, admin: AdminCookie | null, devices: DeviceTokens): Promise<RequestIdentity> {
  const cookies = parseCookies(headers.get('Cookie'));
  const [deviceToken, adminExpiresAt] = await Promise.all([devices.verified(cookies.get(DEVICE_COOKIE)), admin ? admin.expiryOf(cookies.get(ADMIN_COOKIE)) : null]);
  return { deviceToken, adminExpiresAt };
}

/** The caller of one connection, fixed when it was made. Whether it is still the admin is asked of the clock each time. */
export class ConnectionCaller implements Caller {
  constructor(
    private readonly device: Id,
    readonly adminExpiresAt: number | null,
    private readonly now: () => number,
  ) {}

  isAdmin(): boolean {
    return isAdminSessionActive(this.adminExpiresAt, this.now());
  }

  deviceId(): Id {
    return this.device;
  }
}

/** The hub's own jobs, such as the yearly clearing, run as this caller. */
export const SYSTEM_CALLER: Caller = { isAdmin: () => true, deviceId: () => 'system' };
