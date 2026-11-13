import type { SocketCounts } from '../domain/abuse';
import type { Id } from '../domain/models';
import type { OpenReads } from './Gatekeeper';
import { CLOSE_SESSION_ENDED } from '../ports/wire';
import type { Connection } from './Connection';

/** The open connections by their socket, so that the hub can find the ones of a device. */
export class ConnectionRegistry<Key extends object> implements OpenReads {
  private readonly connections = new Map<Key, Connection>();

  add(socket: Key, connection: Connection): void {
    this.connections.set(socket, connection);
  }

  get(socket: Key): Connection | undefined {
    return this.connections.get(socket);
  }

  /** How many sockets are open for this device, for this address, and altogether (restored ones included). */
  countsFor(device: Id, address: string): SocketCounts {
    const open = [...this.connections.values()];
    return { ofDevice: open.filter((connection) => connection.deviceId() === device).length, ofAddress: open.filter((connection) => connection.address() === address).length, inHub: open.length };
  }

  /** How many live reads are open on all the sockets. */
  inHub(): number {
    return [...this.connections.values()].reduce((total, connection) => total + connection.openWatches(), 0);
  }

  /** How many live reads are open on all the sockets of this device together. */
  ofDevice(device: Id): number {
    return [...this.connections.values()].filter((connection) => connection.deviceId() === device).reduce((total, connection) => total + connection.openWatches(), 0);
  }

  /** Stops the connection's live reads and forgets it. */
  forget(socket: Key): void {
    this.connections.get(socket)?.close();
    this.connections.delete(socket);
  }

  /** Closes every socket whose teacher session has run out, including the ones that have been silent. */
  closeExpired(): void {
    for (const [socket, connection] of [...this.connections]) if (connection.endIfExpired()) this.connections.delete(socket);
  }

  /** Closes every socket of a teacher's session that has ended: a socket never changes identity. */
  closeSession(sessionId: string): void {
    for (const [socket, connection] of [...this.connections]) {
      if (connection.adminSessionId() !== sessionId) continue;
      connection.shutDown(CLOSE_SESSION_ENDED, 'signed out');
      this.connections.delete(socket);
    }
  }
}
