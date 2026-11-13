import { MeteredSql } from '../infrastructure/MeteredSql';
import { AddressLocks } from '../infrastructure/sql/addressLocks';
import { migrate } from '../infrastructure/sql/schema';
import { NodeSqlDatabase } from '../infrastructure/testKit/NodeSqlDatabase';
import { CountingSql } from '../infrastructure/testKit/CountingSql';
import { SqlDocumentStore } from '../infrastructure/SqlDocumentStore';
import { parseServerMessage, type ClientMessage, type ServerMessage } from '../ports/wire';
import { LOCAL_ADDRESS } from '../server/address';
import { Connection, type HubSocket } from '../server/Connection';
import { ConnectionRegistry } from '../server/ConnectionRegistry';
import { DayBreaker } from '../server/DayBreaker';
import { Gatekeeper } from '../server/Gatekeeper';
import { HubCore } from '../server/HubCore';

/** What the hub's tests share: a hub over an in-memory database with a clock they move, and sockets that only remember. */

export class FakeSocket implements HubSocket {
  readonly sent: string[] = [];
  private attached: unknown = null;
  broken = false;
  closedWith: { code: number; reason: string } | null = null;

  send(text: string): void {
    if (this.broken) throw new Error('the socket is closed');
    this.sent.push(text);
  }

  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
  }

  serializeAttachment(value: unknown): void {
    this.attached = JSON.parse(JSON.stringify(value));
  }

  deserializeAttachment(): unknown {
    return this.attached;
  }

  messages(): ServerMessage[] {
    return this.sent.flatMap((text) => parseServerMessage(text) ?? []);
  }

  values(id: number): unknown[] {
    return this.messages().flatMap((message) => (message.type === 'value' && message.id === id ? [message.value] : []));
  }

  result(id: number): Extract<ServerMessage, { type: 'result' }> | undefined {
    return this.messages().find((message): message is Extract<ServerMessage, { type: 'result' }> => message.type === 'result' && message.id === id);
  }

  refusal(id: number): Extract<ServerMessage, { type: 'watch-refused' }> | undefined {
    return this.messages().find((message): message is Extract<ServerMessage, { type: 'watch-refused' }> => message.type === 'watch-refused' && message.id === id);
  }
}

export interface Harness {
  /** The database as the store sees it: every write is counted by `meter`, then by `sql`. */
  sql: CountingSql;
  meter: MeteredSql;
  store: SqlDocumentStore;
  core: HubCore;
  /** The hub's memory of its visitors, and the sockets it holds: one of each per harness, as in the real hub. */
  gate: Gatekeeper;
  registry: ConnectionRegistry<object>;
  breaker: DayBreaker;
  clock: { now: number };
  reported: unknown[];
}

/** A hub over a database in memory, or over the file `location`: a second harness over the same file is the hub after a restart. */
export function createHarness(location = ':memory:'): Harness {
  const sql = new CountingSql(new NodeSqlDatabase(location));
  migrate(sql);
  const clock = { now: 1_800_000_000_000 };
  const now = () => clock.now;
  const meter = new MeteredSql(sql, now);
  const reported: unknown[] = [];
  const store = new SqlDocumentStore(meter, (error) => reported.push(error));
  const registry = new ConnectionRegistry<object>();
  const gate = new Gatekeeper(new AddressLocks(meter), now, () => registry.watchCount());
  const breaker = new DayBreaker(meter);
  return { sql, meter, store, clock, reported, gate, registry, breaker, core: new HubCore(store, gate, breaker, now, (error) => reported.push(error)) };
}

export interface Client {
  socket: FakeSocket;
  connection: Connection;
  send(message: ClientMessage): Promise<void>;
  /** Sends a message exactly as it comes off the socket: text, or anything else the platform may deliver. */
  sendRaw(message: string | ArrayBuffer): Promise<void>;
  call(id: number, service: string, method: string, ...args: unknown[]): Promise<Extract<ServerMessage, { type: 'result' }>>;
  watch(id: number, service: string, method: string, ...args: unknown[]): Promise<void>;
}

/** A page connected to the hub as the device `device` from `address`, the admin until `adminExpiresAt` (null for a visitor). */
export function connect(harness: Harness, device: string, adminExpiresAt: number | null = null, address = LOCAL_ADDRESS): Client {
  const socket = new FakeSocket();
  const connection = Connection.open(socket, harness.core, { device, adminExpiresAt, address });
  harness.registry.add(socket, connection);
  return clientOf(socket, connection);
}

export function clientOf(socket: FakeSocket, connection: Connection): Client {
  const send = (message: ClientMessage) => connection.receive(JSON.stringify(message));
  return {
    socket,
    connection,
    send,
    sendRaw: (message) => connection.receive(message),
    async call(id, service, method, ...args) {
      await send({ type: 'call', id, service, method, args });
      const result = socket.result(id);
      if (!result) throw new Error('no result');
      return result;
    },
    watch: (id, service, method, ...args) => send({ type: 'watch', id, service, method, args }),
  };
}
