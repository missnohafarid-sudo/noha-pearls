import { ADMIN_SESSION_MS, DEVICE_COOKIE_MS, adminExpiryFrom, isAdminSessionActive, isLocalHost } from '../domain/adminAccess';
import { toAsciiDigits } from '../domain/digits';
import { verifyTotp } from '../infrastructure/totp';
import type { SignInAttempts } from '../infrastructure/sql/signInAttempts';
import { STATUS_TOO_MANY, type Hello, type SignInAnswer } from '../ports/wire';
import { addressOf } from './address';
import { readLimitedText } from './body';
import { clearedCookieLine, cookieLine } from './cookies';
import type { DeviceTokens } from './DeviceTokens';
import { ADMIN_COOKIE, DEVICE_COOKIE, isDevelopmentPair, type AdminCookie, type AdminSecrets, type RequestIdentity } from './identity';
import { constantTimeEqual } from './webCrypto';

const seconds = (ms: number): number => Math.floor(ms / 1000);

/** The page may only ask from its own address: a request that names another origin is refused. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return origin === null || origin === new URL(request.url).origin;
}

interface Credentials {
  password: string;
  code: string;
}

async function credentialsOf(request: Request): Promise<Credentials | null> {
  const text = await readLimitedText(request);
  if (text === null) return null;
  try {
    const body: unknown = JSON.parse(text);
    const { password, code } = (body ?? {}) as Record<string, unknown>;
    return typeof password === 'string' && typeof code === 'string' ? { password, code } : null;
  } catch {
    return null;
  }
}

/**
 * The plain requests: who am I, sign in, sign out. The identity it sets is in cookies only the hub can make; the page
 * learns only whether it is the admin. Knows nothing of classes. Hello is given who sent the request, worked out once.
 */
export class HubHttp {
  private readonly developmentPair: Promise<boolean>;

  constructor(
    private readonly secrets: AdminSecrets | null,
    private readonly admin: AdminCookie | null,
    private readonly attempts: SignInAttempts,
    private readonly devices: DeviceTokens,
    private readonly now: () => number,
  ) {
    this.developmentPair = secrets ? isDevelopmentPair(secrets) : Promise.resolve(false);
  }

  /**
   * Renews the device's cookie if it has one the hub issued, and otherwise gives it a new one (an unsigned or damaged one is
   * replaced); says whether it is the admin. An address that has been given too many new cookies lately is refused.
   */
  async hello(request: Request, identity: RequestIdentity): Promise<Response> {
    const token = identity.deviceToken ?? (await this.devices.issue(addressOf(request)));
    if (token === null) return new Response(null, { status: STATUS_TOO_MANY });
    const hello: Hello = { admin: isAdminSessionActive(identity.adminExpiresAt, this.now()), now: this.now() };
    const headers = new Headers({ 'Set-Cookie': cookieLine(DEVICE_COOKIE, token, { maxAgeSeconds: seconds(DEVICE_COOKIE_MS), secure: this.isSecure(request) }) });
    return Response.json(hello, { headers });
  }

  async signIn(request: Request): Promise<Response> {
    const headers = new Headers();
    const credentials = await credentialsOf(request);
    if (!this.secrets || !this.admin || !credentials || !(await this.mayAttemptHere(request))) return this.answer(false, headers);
    const address = addressOf(request);
    const now = this.now();
    if (!this.attempts.begin(address, now)) return this.answer(false, headers);
    if (!(await this.credentialsMatch(this.secrets, credentials, now))) return this.answer(false, headers);
    this.attempts.clear(address);
    const expiresAt = adminExpiryFrom(now);
    headers.append('Set-Cookie', cookieLine(ADMIN_COOKIE, await this.admin.sign(expiresAt), { maxAgeSeconds: seconds(ADMIN_SESSION_MS), secure: this.isSecure(request) }));
    return this.answer(true, headers);
  }

  signOut(request: Request): Response {
    const headers = new Headers();
    headers.append('Set-Cookie', clearedCookieLine(ADMIN_COOKIE, this.isSecure(request)));
    return Response.json({}, { headers });
  }

  /** Sign-in needs a private line (https) except on this computer, and a deployed hub never takes the public development secrets. */
  private async mayAttemptHere(request: Request): Promise<boolean> {
    const { protocol, hostname } = new URL(request.url);
    if (isLocalHost(hostname)) return true;
    return protocol === 'https:' && !(await this.developmentPair);
  }

  /** Both secrets are always compared, so how long the answer takes does not say which one was wrong. */
  private async credentialsMatch(secrets: AdminSecrets, { password, code }: Credentials, now: number): Promise<boolean> {
    const [passwordMatches, codeMatches] = await Promise.all([constantTimeEqual(password, secrets.password), verifyTotp(secrets.totpSecret, toAsciiDigits(code), now)]);
    return passwordMatches && codeMatches;
  }

  private answer(ok: boolean, headers: Headers): Response {
    const answer: SignInAnswer = { ok };
    return Response.json(answer, { headers });
  }

  private isSecure(request: Request): boolean {
    return new URL(request.url).protocol === 'https:';
  }
}
