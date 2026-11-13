import type { Id } from '../domain/models';
import { HELLO_PATH, LIVE_PATH, SIGN_IN_PATH, SIGN_OUT_PATH, STATUS_TOO_MANY } from '../ports/wire';
import type { AdminSessions } from './AdminSessions';
import { addressOf } from './address';
import { bodyRefusal } from './body';
import type { ConnectionOrigin } from './Connection';
import type { ConnectionRegistry } from './ConnectionRegistry';
import type { DeviceTokens } from './DeviceTokens';
import type { Gatekeeper } from './Gatekeeper';
import type { HubHttp } from './HubHttp';
import { isSameOrigin } from './HubHttp';
import { identityOf, type RequestIdentity } from './identity';

/** Who a new socket is, as its cookies and its address say, and the response that accepts it. */
export type AcceptSocket = (origin: ConnectionOrigin) => Response;

const refuse = (status: number, text: string): Response => new Response(text, { status });
/** A refusal that says nothing of why. */
const tooMany = (): Response => new Response(null, { status: STATUS_TOO_MANY });

/**
 * What the hub does with each request it is sent. The cheap refusals come first, before any cookie is read or any body is
 * touched: the method, the origin, the size. Then who sent it is worked out once, and the request goes to the part that answers it.
 */
export class HubRequests {
  constructor(
    private readonly http: HubHttp,
    private readonly sessions: AdminSessions | null,
    private readonly devices: DeviceTokens,
    private readonly connections: ConnectionRegistry<object>,
    private readonly gate: Gatekeeper,
    private readonly seated: (device: Id) => Promise<boolean>,
    private readonly accept: AcceptSocket,
  ) {}

  /** Forgets what has run out: called by the hub's alarm. */
  prune(): void {
    this.devices.prune();
  }

  async handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const socket = pathname === LIVE_PATH && request.method === 'GET' && request.headers.get('Upgrade') === 'websocket';
    if (!socket && request.method !== 'POST') return refuse(404, 'Not found');
    if (!isSameOrigin(request)) return refuse(403, 'Forbidden');
    if (!socket) {
      const tooBig = bodyRefusal(request);
      if (tooBig) return tooBig;
    }
    const identity = await identityOf(request, this.sessions, this.devices);
    if (socket) return this.openSocket(addressOf(request), identity);
    if (pathname === HELLO_PATH) return this.isTurnedAway(identity) ? tooMany() : this.http.hello(request, identity);
    if (pathname === SIGN_IN_PATH) return this.http.signIn(request);
    if (pathname === SIGN_OUT_PATH) return this.signOut(request, identity);
    return refuse(404, 'Not found');
  }

  /** A device the hub has locked is turned away, unless the teacher is signed in on it. A request with no device yet is a new one. */
  private isTurnedAway({ device, admin }: RequestIdentity): boolean {
    return device !== null && this.gate.turnsAway(device, admin !== null);
  }

  /**
   * A socket opens for a device the hub issued that is not locked (unless the teacher is signed in), while the caps have room for it.
   * The teacher's session is checked once more, without waiting, right before the socket is accepted: a sign-out that came in during
   * the waits above leaves a visitor's socket, not a teacher's.
   */
  private async openSocket(address: string, identity: RequestIdentity): Promise<Response> {
    const { device, admin } = identity;
    if (device === null) return refuse(401, 'Unauthorized');
    if (this.isTurnedAway(identity)) return tooMany();
    const verdict = this.gate.socketVerdict(this.connections.countsFor(device, address), admin !== null);
    if ((await this.gate.refusal(verdict, () => this.seated(device))) !== null) return tooMany();
    return this.accept({ device, admin: admin !== null && this.sessions?.isOpen(admin) ? admin : null, address });
  }

  /** Signing out ends the teacher's session and closes every socket that runs under it, not only the ones opened later. */
  private signOut(request: Request, { admin }: RequestIdentity): Response {
    if (admin !== null) {
      this.sessions?.end(admin);
      this.connections.closeSession(admin.id);
    }
    return this.http.signOut(request);
  }
}
