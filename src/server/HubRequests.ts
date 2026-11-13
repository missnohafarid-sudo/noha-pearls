import { HELLO_PATH, LIVE_PATH, SIGN_IN_PATH, SIGN_OUT_PATH, STATUS_TOO_MANY } from '../ports/wire';
import { addressOf } from './address';
import { bodyRefusal } from './body';
import type { ConnectionOrigin } from './Connection';
import type { ConnectionRegistry } from './ConnectionRegistry';
import type { DeviceTokens } from './DeviceTokens';
import type { Gatekeeper } from './Gatekeeper';
import type { HubHttp } from './HubHttp';
import { isSameOrigin } from './HubHttp';
import { deviceIdOf, identityOf, type AdminCookie, type RequestIdentity } from './identity';

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
    private readonly admin: AdminCookie | null,
    private readonly devices: DeviceTokens,
    private readonly connections: ConnectionRegistry<object>,
    private readonly gate: Gatekeeper,
    private readonly accept: AcceptSocket,
  ) {}

  async handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const socket = pathname === LIVE_PATH && request.method === 'GET' && request.headers.get('Upgrade') === 'websocket';
    if (!socket && request.method !== 'POST') return refuse(404, 'Not found');
    if (!isSameOrigin(request)) return refuse(403, 'Forbidden');
    if (!socket) {
      const tooBig = bodyRefusal(request);
      if (tooBig) return tooBig;
    }
    const identity = await identityOf(request.headers, this.admin, this.devices);
    const address = addressOf(request);
    if (socket) return this.openSocket(address, identity);
    if (pathname === HELLO_PATH) return this.gate.turnsAway(address, identity.adminExpiresAt) ? tooMany() : this.http.hello(request, identity);
    if (pathname === SIGN_IN_PATH) return this.http.signIn(request);
    if (pathname === SIGN_OUT_PATH) return this.signOut(request, identity.deviceToken);
    return refuse(404, 'Not found');
  }

  /** A socket opens for a device the hub issued, from an address that is not locked (unless the teacher is signed in), while the hub has room for it. */
  private async openSocket(address: string, { deviceToken, adminExpiresAt }: RequestIdentity): Promise<Response> {
    if (deviceToken === null) return refuse(401, 'Unauthorized');
    if (this.gate.turnsAway(address, adminExpiresAt)) return tooMany();
    const device = await deviceIdOf(deviceToken);
    if (!this.gate.admits(this.connections.countsFor(device, address))) return tooMany();
    return this.accept({ device, adminExpiresAt, address });
  }

  /** Signing out takes the teacher's rights from every socket of the device at once, not only from the ones opened later. */
  private async signOut(request: Request, deviceToken: string | null): Promise<Response> {
    if (deviceToken !== null) this.connections.closeDevice(await deviceIdOf(deviceToken));
    return this.http.signOut(request);
  }
}
