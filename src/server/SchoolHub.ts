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

/**
 * The hub: the one place the school's data lives and every device connects to. This class only joins the platform to
 * the parts that carry the logic: `HubRequests` for each request, `Connection` for each socket, `HubCore` for the store.
 */
export class SchoolHub extends DurableObject<Env> {
  private readonly core: HubCore;
  private readonly sessions: Promise<AdminSessions | null>;
  private readonly requests: Promise<HubRequests>;
  private readonly connections = new ConnectionRegistry<WebSocket>();
  private readonly adminSessions: AdminSessionTable;
  private readonly signIns: SignInGuard;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const raw = new DurableObjectSql(ctx.storage);
    migrate(raw);
    const db = new MeteredSql(raw, Date.now);
    const report = (error: unknown): void => console.error(error);
    const locks = new SqlLocks(db);
    const gate = new Gatekeeper(Date.now, this.connections);
    this.core = new HubCore(new SqlDocumentStore(db, report), gate, new DayBreaker(db), Date.now, report);
    const secrets = adminSecretsOf(env);
    this.adminSessions = new AdminSessionTable(db);
    this.signIns = new SignInGuard(locks, new SqlWindowMemory(db), Date.now);
    this.sessions = Promise.resolve(secrets ? AdminSessions.from(secrets, this.adminSessions, Date.now) : null);
    this.requests = Promise.all([this.sessions, DeviceTokens.from(db, Date.now)]).then(
      ([sessions, devices]) =>
        new HubRequests(new HubHttp(secrets, sessions, this.signIns, devices, this.core.now), sessions, devices, this.connections, gate, (device) => this.core.isSeated(device), (origin) => this.acceptSocket(origin)),
    );
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    ctx.blockConcurrencyWhile(async () => {
      await this.core.seed(wantsSampleSchool(env));
      const sessions = (await this.sessions) ?? NO_SESSIONS;
      for (const socket of ctx.getWebSockets()) this.restore(socket, sessions);
      if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(await this.core.nextCheckAt());
    });
  }

  async fetch(request: Request): Promise<Response> {
    return (await this.requests).handle(request);
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
    this.connections.closeExpired();
    this.adminSessions.prune(Date.now());
    this.signIns.prune();
    (await this.requests).prune();
    await this.ctx.storage.setAlarm(await this.core.runAlarm());
  }

  private acceptSocket(origin: ConnectionOrigin): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.connections.add(server, Connection.open(server, this.core, origin));
    return new Response(null, { status: 101, webSocket: client });
  }

  private restore(socket: WebSocket, sessions: SessionRegister): void {
    const connection = Connection.restore(socket, this.core, sessions);
    if (connection) this.connections.add(socket, connection);
    else socket.close(CLOSE_POLICY, 'lost its identity');
  }
}
