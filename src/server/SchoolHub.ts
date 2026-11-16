import { DurableObject } from 'cloudflare:workers';
import { MeteredSql } from '../infrastructure/MeteredSql';
import { AdminSessionTable } from '../infrastructure/sql/adminSessions';
import { SqlLocks } from '../infrastructure/sql/locks';
import { migrate } from '../infrastructure/sql/schema';
import { restoreSnapshot, takeSnapshot, type Snapshot } from '../infrastructure/sql/snapshot';
import { SqlWindowMemory } from '../infrastructure/sql/windowEvents';
import { SqlDocumentStore } from '../infrastructure/SqlDocumentStore';
import type { SqlDatabase } from '../ports/sql';
import { CLOSE_HUB_MOVED, CLOSE_POLICY, PING, PONG, STATUS_HUB_MOVED } from '../ports/wire';
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
import { formerHub, HUB_NAME } from './hubName';
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
 * Kept in the platform's key-value store, which the hub's own tables never hold: this hub gave all its data to the hub that replaced
 * it; this hub holds the former hub's data; the former hub has been told to answer nothing for good.
 */
const HANDED_OVER = 'handed-over';
const MOVED_IN = 'moved-in';
const FORMER_RETIRED = 'former-retired';

/**
 * The hub: the one place the school's data lives and every device connects to. This class only joins the platform to
 * the parts that carry the logic: `HubRequests` for each request, `Connection` for each socket, `HubCore` for the store.
 */
export class SchoolHub extends DurableObject<Env> {
  private readonly connections = new ConnectionRegistry<WebSocket>();
  private readonly parts: Promise<HubParts>;
  /** Giving its data to the hub that replaces it (`giveData`): until it is built again, it answers nothing. */
  private giving = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.parts = ctx.blockConcurrencyWhile(() => this.start());
  }

  async fetch(request: Request): Promise<Response> {
    const { requests } = await this.parts;
    return this.handedOver() ? new Response(null, { status: STATUS_HUB_MOVED }) : requests.handle(request);
  }

  /**
   * The first half of a move, asked by the hub that replaces this one: until this hub is built again it answers nothing, and all its
   * data is returned. Nothing is kept, so asking again is safe; only `retire` makes it for good.
   */
  async giveData(): Promise<Snapshot> {
    await this.parts;
    this.giving = true;
    for (const socket of this.ctx.getWebSockets()) closeMoved(socket);
    return takeSnapshot(new DurableObjectSql(this.ctx.storage));
  }

  /** The second half, once the new hub has stored the data: this hub answers nothing for good and wakes for no alarm. */
  async retire(): Promise<void> {
    this.ctx.storage.kv.put(HANDED_OVER, true);
    await this.ctx.storage.deleteAlarm();
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> | void {
    if (this.handedOver()) return closeMoved(socket);
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
    if (this.handedOver()) return;
    this.connections.closeExpired();
    adminSessions.prune(Date.now());
    signIns.prune();
    requests.prune();
    await this.ctx.storage.setAlarm(await core.runAlarm());
  }

  private async start(): Promise<HubParts> {
    const raw = new DurableObjectSql(this.ctx.storage);
    migrate(raw);
    await this.moveIn(raw);
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
    if (!this.handedOver() && (await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(await core.nextCheckAt());
    return { core, requests, adminSessions, signIns };
  }

  /** A hub that has handed over answers nothing, keeps no socket and wakes for no alarm. */
  private handedOver(): boolean {
    return this.giving || this.ctx.storage.kv.get<boolean>(HANDED_OVER) === true;
  }

  /**
   * The first start of the hub named `HUB_NAME` takes all the former hub's data before any part reads this hub's storage, and
   * then retires the former hub (again on a later start, if that failed). Only a hub that has not moved needs its name to know
   * which it is; one reached without it does not start rather than open an empty school.
   */
  private async moveIn(raw: SqlDatabase): Promise<void> {
    const { kv } = this.ctx.storage;
    if (kv.get<boolean>(HANDED_OVER) === true) return;
    if (kv.get<boolean>(MOVED_IN) !== true) {
      const { name } = this.ctx.id;
      if (name === undefined) throw new Error('The hub was reached without its name');
      if (name !== HUB_NAME) return;
      const snapshot = await formerHub(this.env.HUB).giveData();
      raw.transaction(() => {
        restoreSnapshot(raw, snapshot);
        kv.put(MOVED_IN, true);
      });
    }
    if (kv.get<boolean>(FORMER_RETIRED) === true) return;
    try {
      await formerHub(this.env.HUB).retire();
      kv.put(FORMER_RETIRED, true);
    } catch (error) {
      console.error(error);
    }
  }

  private acceptSocket(core: HubCore, origin: ConnectionOrigin): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.connections.add(server, Connection.open(server, core, origin));
    return new Response(null, { status: 101, webSocket: client });
  }

  private restore(socket: WebSocket, core: HubCore, sessions: SessionRegister): void {
    if (this.handedOver()) return closeMoved(socket);
    const connection = Connection.restore(socket, core, sessions);
    if (connection) this.connections.add(socket, connection);
    else socket.close(CLOSE_POLICY, 'lost its identity');
  }
}

const closeMoved = (socket: WebSocket): void => socket.close(CLOSE_HUB_MOVED, 'the hub moved');
