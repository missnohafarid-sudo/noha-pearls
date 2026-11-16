import { DurableObject } from 'cloudflare:workers';
import { MeteredSql } from '../infrastructure/MeteredSql';
import { AdminSessionTable } from '../infrastructure/sql/adminSessions';
import { SqlLocks } from '../infrastructure/sql/locks';
import { migrate } from '../infrastructure/sql/schema';
import { SqlWindowMemory } from '../infrastructure/sql/windowEvents';
import { SqlDocumentStore } from '../infrastructure/SqlDocumentStore';
import { CLOSE_POLICY, PING, PONG } from '../ports/wire';
import { AdminSessions, NO_SESSIONS, type SessionRegister } from './AdminSessions';
import { Connection, type ConnectionOrigin } from './Connection';
import { ConnectionRegistry } from './ConnectionRegistry';
import { DayBreaker } from './DayBreaker';
import { DeviceTokens } from './DeviceTokens';
import { DurableObjectSql } from './DurableObjectSql';
import { Gatekeeper } from './Gatekeeper';
import { HubCore } from './HubCore';
import { HubHttp } from './HubHttp';
import { HubRequests } from './HubRequests';
import { adminSecretsOf } from './identity';
import { wantsSampleSchool } from './sampleSchool';
import { SignInGuard } from './SignInGuard';

/** The parts that read the hub's storage; they are built only once the storage is ready (`start`). */
interface HubParts {
  core: HubCore;
  requests: HubRequests;
  adminSessions: AdminSessionTable;
  signIns: SignInGuard;
}

/**
 * The hub: the one place the school's data lives and every device connects to. This class only joins the platform to
 * the parts that carry the logic: `HubRequests` for each request, `Connection` for each socket, `HubCore` for the store.
 */
export class SchoolHub extends DurableObject<Env> {
  private readonly connections = new ConnectionRegistry<WebSocket>();
  private readonly parts: Promise<HubParts>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.parts = ctx.blockConcurrencyWhile(() => this.start());
  }

  async fetch(request: Request): Promise<Response> {
    return (await this.parts).requests.handle(request);
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> | void {
    const connection = this.connections.get(socket);
    return connection ? connection.receive(message) : socket.close(CLOSE_POLICY, 'unknown connection');
  }

  webSocketClose(socket: WebSocket): void {
    this.connections.forget(socket);
  }

  webSocketError(socket: WebSocket): void {
    this.connections.forget(socket);
  }

  async alarm(): Promise<void> {
    const { core, requests, adminSessions, signIns } = await this.parts;
    this.connections.closeExpired();
    adminSessions.prune(Date.now());
    signIns.prune();
    requests.prune();
    await this.ctx.storage.setAlarm(await core.runAlarm());
  }

  private async start(): Promise<HubParts> {
    const raw = new DurableObjectSql(this.ctx.storage);
    migrate(raw);
    const db = new MeteredSql(raw, Date.now);
    const report = (error: unknown): void => console.error(error);
    const gate = new Gatekeeper(Date.now, this.connections);
    const core = new HubCore(new SqlDocumentStore(db, report), gate, new DayBreaker(db), Date.now, report);
    const secrets = adminSecretsOf(this.env);
    const adminSessions = new AdminSessionTable(db);
    const signIns = new SignInGuard(new SqlLocks(db), new SqlWindowMemory(db), Date.now);
    const [sessions, devices] = await Promise.all([secrets ? AdminSessions.from(secrets, adminSessions, Date.now) : null, DeviceTokens.from(db, Date.now)]);
    const requests = new HubRequests(new HubHttp(secrets, sessions, signIns, devices, core.now), sessions, devices, this.connections, gate, (device) => core.isSeated(device), (origin) => this.acceptSocket(core, origin));
    await core.seed(wantsSampleSchool(this.env));
    for (const socket of this.ctx.getWebSockets()) this.restore(socket, core, sessions ?? NO_SESSIONS);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(await core.nextCheckAt());
    return { core, requests, adminSessions, signIns };
  }

  private acceptSocket(core: HubCore, origin: ConnectionOrigin): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.connections.add(server, Connection.open(server, core, origin));
    return new Response(null, { status: 101, webSocket: client });
  }

  private restore(socket: WebSocket, core: HubCore, sessions: SessionRegister): void {
    const connection = Connection.restore(socket, core, sessions);
    if (connection) this.connections.add(socket, connection);
    else socket.close(CLOSE_POLICY, 'lost its identity');
  }
}
