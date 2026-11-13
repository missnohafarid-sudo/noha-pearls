import { ADMIN_SESSION_MS, DEVICE_COOKIE_MS, signInOutcome, type SignInOutcome } from '../domain/adminAccess';
import { toAsciiDigits } from '../domain/digits';
import { verifyTotp } from '../infrastructure/totp';
import { STATUS_NETWORK_FULL, type Hello, type SignInAnswer } from '../ports/wire';
import type { AdminSessions } from './AdminSessions';
import { addressOf, isLocalRequest } from './address';
import { readLimitedText } from './body';
import { clearedCookieLine, cookieLine } from './cookies';
import type { DeviceTokens } from './DeviceTokens';
import { ADMIN_COOKIE, DEVICE_COOKIE, type AdminSecrets, type RequestIdentity } from './identity';
import type { SignInGuard } from './SignInGuard';
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
  constructor(
    private readonly secrets: AdminSecrets | null,
    private readonly sessions: AdminSessions | null,
    private readonly signIns: SignInGuard,
    private readonly devices: DeviceTokens,
    private readonly now: () => number,
  ) {}

  /**
   * Renews the device's cookie if it has one the hub issued, and otherwise gives it a new one (an unsigned or damaged one is
   * replaced); says whether it is the admin. An address that has been given too many new cookies lately is refused.
   */
  async hello(request: Request, identity: RequestIdentity): Promise<Response> {
    const token = identity.deviceToken ?? (await this.devices.issue(addressOf(request), identity.admin !== null));
    if (token === null) return new Response(null, { status: STATUS_NETWORK_FULL });
    const hello: Hello = { admin: identity.admin !== null, now: this.now() };
    const headers = new Headers({ 'Set-Cookie': cookieLine(DEVICE_COOKIE, token, { maxAgeSeconds: seconds(DEVICE_COOKIE_MS), secure: this.isSecure(request) }) });
    return Response.json(hello, { headers });
  }

  async signIn(request: Request): Promise<Response> {
    const headers = new Headers();
    const credentials = await credentialsOf(request);
    if (!this.secrets || !this.sessions || !credentials || !this.mayAttemptHere(this.sessions, request)) return this.answer(false, headers);
    const address = addressOf(request);
    if (!this.signIns.begin(address)) return this.refused(headers);
    const outcome = await this.outcomeOf(this.secrets, credentials);
    if (!this.signIns.finish(address, outcome)) return this.refused(headers);
    const { cookie } = await this.sessions.open();
    headers.append('Set-Cookie', cookieLine(ADMIN_COOKIE, cookie, { maxAgeSeconds: seconds(ADMIN_SESSION_MS), secure: this.isSecure(request) }));
    return this.answer(true, headers);
  }

  signOut(request: Request): Response {
    const headers = new Headers();
    headers.append('Set-Cookie', clearedCookieLine(ADMIN_COOKIE, this.isSecure(request)));
    return Response.json({}, { headers });
  }

  /** Sign-in needs a private line (https) except on this computer, and secrets with a public development value count only on this computer. */
  private mayAttemptHere(sessions: AdminSessions, request: Request): boolean {
    const isLocal = isLocalRequest(request);
    return sessions.honoured(isLocal) && (isLocal || this.isSecure(request));
  }

  /** Both secrets are always compared, so how long the answer takes does not say which one was wrong. */
  private async outcomeOf(secrets: AdminSecrets, { password, code }: Credentials): Promise<SignInOutcome> {
    const [passwordMatches, codeMatches] = await Promise.all([constantTimeEqual(password, secrets.password), verifyTotp(secrets.totpSecret, toAsciiDigits(code), this.now())]);
    return signInOutcome(passwordMatches, codeMatches);
  }

  private answer(ok: boolean, headers: Headers): Response {
    const answer: SignInAnswer = { ok };
    return Response.json(answer, { headers });
  }

  /** A refusal of an attempt the guard saw: it says so when sign-in is closed for everyone, and otherwise only that it failed. */
  private refused(headers: Headers): Response {
    const answer: SignInAnswer = this.signIns.isClosed() ? { ok: false, closed: true } : { ok: false };
    return Response.json(answer, { headers });
  }

  private isSecure(request: Request): boolean {
    return new URL(request.url).protocol === 'https:';
  }
}
