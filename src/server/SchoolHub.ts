import { DurableObject } from 'cloudflare:workers';
import { MeteredSql } from '../infrastructure/MeteredSql';
import { AddressLocks } from '../infrastructure/sql/addressLocks';
import { migrate } from '../infrastructure/sql/schema';
import { SignInAttempts } from '../infrastructure/sql/signInAttempts';
import { SqlDocumentStore } from '../infrastructure/SqlDocumentStore';
import { CLOSE_POLICY, PING, PONG } from '../ports/wire';
import { Connection, type ConnectionOrigin } from './Connection';
import { ConnectionRegistry } from './ConnectionRegistry';
import { DayBreaker } from './DayBreaker';
import { DeviceTokens } from './DeviceTokens';
import { DurableObjectSql } from './DurableObjectSql';
import { Gatekeeper } from './Gatekeeper';
import { HubCore } from './HubCore';
import { HubHttp } from './HubHttp';
import { HubRequests } from './HubRequests';
import { AdminCookie, adminSecretsOf } from './identity';
import { wantsSampleSchool } from './sampleSchool';

/**
 * The hub: the one place the school's data lives and every device connects to. This class only joins the platform to
 * the parts that carry the logic: `HubRequests` for each request, `Connection` for each socket, `HubCore` for the store.
 */
export class SchoolHub extends DurableObject<Env> {
  private readonly core: HubCore;
  private readonly requests: Promise<HubRequests>;
  private readonly connections = new ConnectionRegistry<WebSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const raw = new DurableObjectSql(ctx.storage);
    migrate(raw);
    const db = new MeteredSql(raw, Date.now);
    const report = (error: unknown): void => console.error(error);
    const gate = new Gatekeeper(new AddressLocks(db), Date.now, () => this.connections.watchCount());
    this.core = new HubCore(new SqlDocumentStore(db, report), gate, new DayBreaker(db), Date.now, report);
    const secrets = adminSecretsOf(env);
    const attempts = new SignInAttempts(db);
    this.requests = Promise.all([AdminCookie.from(secrets), DeviceTokens.from(secrets, db, Date.now)]).then(
      ([admin, devices]) => new HubRequests(new HubHttp(secrets, admin, attempts, devices, this.core.now), admin, devices, this.connections, gate, (origin) => this.acceptSocket(origin)),
    );
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    ctx.blockConcurrencyWhile(async () => {
      await this.core.seed(wantsSampleSchool(env));
      for (const socket of ctx.getWebSockets()) this.restore(socket);
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
    await this.ctx.storage.setAlarm(await this.core.runAlarm());
  }

  private acceptSocket(origin: ConnectionOrigin): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.connections.add(server, Connection.open(server, this.core, origin));
    return new Response(null, { status: 101, webSocket: client });
  }

  private restore(socket: WebSocket): void {
    const connection = Connection.restore(socket, this.core);
    if (connection) this.connections.add(socket, connection);
    else socket.close(CLOSE_POLICY, 'lost its identity');
  }
}
