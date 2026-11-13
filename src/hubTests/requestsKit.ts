import { expect } from 'vitest';
import { createHarness, FakeSocket } from './hubHarness';
import { SignInAttempts } from '../infrastructure/sql/signInAttempts';
import { migrate } from '../infrastructure/sql/schema';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { totpCode } from '../infrastructure/totp';
import { Connection } from '../server/Connection';
import { DeviceTokens } from '../server/DeviceTokens';
import { HubHttp } from '../server/HubHttp';
import { HubRequests, type AcceptSocket } from '../server/HubRequests';
import { AdminCookie } from '../server/identity';

/** The hub's requests over a harness, and the requests and cookies a browser would send them. */

export const SECRETS = { password: 'teach-2468', totpSecret: 'JBSWY3DPEHPK3PXP' };
export const LOCAL = 'http://localhost';

export async function hub(secrets: typeof SECRETS | null = SECRETS) {
  const harness = createHarness();
  await harness.core.seed();
  const db = new NodeSqlDatabase();
  migrate(db);
  const admin = await AdminCookie.from(secrets);
  const { registry, gate } = harness;
  const devices = await DeviceTokens.from(secrets, db, () => harness.clock.now);
  const sockets: FakeSocket[] = [];
  const accept: AcceptSocket = (origin) => {
    const socket = new FakeSocket();
    registry.add(socket, Connection.open(socket, harness.core, origin));
    sockets.push(socket);
    return new Response('accepted');
  };
  const http = new HubHttp(secrets, admin, new SignInAttempts(db), devices, () => harness.clock.now);
  const requests = new HubRequests(http, admin, devices, registry, gate, accept);
  return { harness, requests, sockets, registry, devices };
}

const bytes = (text: string) => new TextEncoder().encode(text).length;
export const post = (path: string, body?: unknown, headers: Record<string, string> = {}, origin = LOCAL) => {
  const text = body === undefined ? '' : JSON.stringify(body);
  return new Request(`${origin}${path}`, { method: 'POST', headers: { 'Content-Length': String(bytes(text)), ...headers }, body: text === '' ? undefined : text });
};
export const upgrade = (headers: Record<string, string> = {}) => new Request(`${LOCAL}/api/live`, { method: 'GET', headers: { Upgrade: 'websocket', ...headers } });
const cookiePairs = (response: Response) => response.headers.getSetCookie().filter((line) => !/Max-Age=0/.test(line)).map((line) => line.split(';')[0]);
export const jar = (...responses: Response[]) => responses.flatMap(cookiePairs).join('; ');

/** A device that said hello and signed in; its cookies as a browser would send them. */
export async function teacher(h: Awaited<ReturnType<typeof hub>>, address = '10.0.0.1') {
  const hello = await h.requests.handle(post('/api/hello'));
  const device = jar(hello);
  const code = await totpCode(SECRETS.totpSecret, h.harness.clock.now);
  const signedIn = await h.requests.handle(post('/api/sign-in', { password: SECRETS.password, code }, { Cookie: device, 'CF-Connecting-IP': address }));
  expect(await signedIn.clone().json()).toEqual({ ok: true });
  return { device, cookie: jar(hello, signedIn) };
}

