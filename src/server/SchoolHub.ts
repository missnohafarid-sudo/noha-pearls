import { DurableObject } from 'cloudflare:workers';
import { SqlDocumentStore } from '../infrastructure/SqlDocumentStore';
import { DurableObjectSql } from './DurableObjectSql';

const PROBE_ID = 'health-probe';

/**
 * The hub: the one place the school's data lives and the one place every device connects to.
 * For now it only proves the stack: a counter kept through the document store, and a socket that echoes.
 */
export class SchoolHub extends DurableObject<Env> {
  private readonly store: SqlDocumentStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqlDocumentStore(new DurableObjectSql(ctx.storage));
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') return Response.json({ ok: true, calls: await this.countCall() });
    if (pathname === '/api/live' && request.headers.get('Upgrade') === 'websocket') return this.acceptSocket();
    return new Response('Not found', { status: 404 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    socket.send(message);
  }

  private async countCall(): Promise<number> {
    const calls = ((await this.store.get('classes', PROBE_ID))?.order ?? 0) + 1;
    await this.store.put('classes', { id: PROBE_ID, name: 'health probe', order: calls });
    return calls;
  }

  private acceptSocket(): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }
}
