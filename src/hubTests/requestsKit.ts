import { expect } from 'vitest';
import { createHarness, FakeSocket, type Harness } from './hubHarness';
import { SqlWindowMemory } from '../infrastructure/sql/windowEvents';
import { totpCode } from '../infrastructure/totp';
import { Connection } from '../server/Connection';
import { DeviceTokens } from '../server/DeviceTokens';
import { HubHttp } from '../server/HubHttp';
import { HubRequests, type AcceptSocket } from '../server/HubRequests';
import { AdminSessions } from '../server/AdminSessions';
import { SignInGuard } from '../server/SignInGuard';

/** The hub's requests over a harness, and the requests and cookies a browser would send them. */

export const SECRETS = { password: 'teach-2468', totpSecret: 'JBSWY3DPEHPK3PXP' };
export const LOCAL = 'http://localhost';

/** The hub's requests over a harness: the secrets (or none) it was started with, and an optional file to keep its database in. */
export async function hub(secrets: typeof SECRETS | null = SECRETS, location?: string) {
  const harness = createHarness(location);
  await harness.core.seed(true);
  const { registry, gate, meter } = harness;
  const now = () => harness.clock.now;
  const sessions = secrets ? await AdminSessions.from(secrets, harness.adminSessions, now) : null;
  const devices = await DeviceTokens.from(meter, now);
  const sockets: FakeSocket[] = [];
  const accept: AcceptSocket = (origin) => {
    const socket = new FakeSocket();
    registry.add(socket, Connection.open(socket, harness.core, origin));
    sockets.push(socket);
    return new Response('accepted');
  };
  const signIns = new SignInGuard(harness.locks, new SqlWindowMemory(meter), now);
  const http = new HubHttp(secrets, sessions, signIns, devices, now);
  const requests = new HubRequests(http, sessions, devices, registry, gate, (device) => harness.core.isSeated(device), accept);
  return { harness, requests, sockets, registry, devices, sessions, signIns };
}

/** The hub waking up: the socket's connection is made again from its attachment, its teacher's session checked against the database. */
export async function wake(harness: Harness, socket: FakeSocket): Promise<Connection | null> {
  const sessions = await AdminSessions.from(SECRETS, harness.adminSessions, () => harness.clock.now);
  return Connection.restore(socket, harness.core, sessions);
}

const bytes = (text: string) => new TextEncoder().encode(text).length;
export const post = (path: string, body?: unknown, headers: Record<string, string> = {}, origin = LOCAL) => {
  const text = body === undefined ? '' : JSON.stringify(body);
  return new Request(`${origin}${path}`, { method: 'POST', headers: { 'Content-Length': String(bytes(text)), ...headers }, body: text === '' ? undefined : text });
};
export const upgrade = (headers: Record<string, string> = {}, origin = LOCAL) => new Request(`${origin}/api/live`, { method: 'GET', headers: { Upgrade: 'websocket', ...headers } });
const cookiePairs = (response: Response) => response.headers.getSetCookie().filter((line) => !/Max-Age=0/.test(line)).map((line) => line.split(';')[0]);
export const jar = (...responses: Response[]) => responses.flatMap(cookiePairs).join('; ');

/** A device that said hello and signed in; its cookies as a browser would send them. */
export async function teacher(h: Awaited<ReturnType<typeof hub>>, address = '10.0.0.1', secrets = SECRETS, origin = LOCAL) {
  const hello = await h.requests.handle(post('/api/hello', undefined, {}, origin));
  const device = jar(hello);
  const code = await totpCode(secrets.totpSecret, h.harness.clock.now);
  const signedIn = await h.requests.handle(post('/api/sign-in', { password: secrets.password, code }, { Cookie: device, 'CF-Connecting-IP': address }, origin));
  expect(await signedIn.clone().json()).toEqual({ ok: true });
  return { device, cookie: jar(hello, signedIn) };
}

