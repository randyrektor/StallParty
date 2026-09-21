import {
  allowWatchRate,
  applyWatchMessage,
  isWatchPayloadTooLarge,
  nextRoomAlarm,
  normalizeRoomId,
  parseClientMessage,
  WATCH_MAX_SOCKETS,
  type RoomState,
} from '../src/utils/watchRoom';
import { sanitizeSpectatorSnapshot } from '../src/utils/spectatorState';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS?: Fetcher;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'sha256-T6yU/ugci+IZY5eYdxlBh7P0PyzqfyxlXQL2n+KJlAA='",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; '),
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const CRAWL_TYPES: Record<string, string> = {
  '/robots.txt': 'text/plain; charset=utf-8',
  '/sitemap.xml': 'application/xml; charset=utf-8',
  '/sitemap.txt': 'text/plain; charset=utf-8',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/watch-ws') {
      const room = normalizeRoomId(url.searchParams.get('room') ?? '');
      if (!room) return new Response('bad-room', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(request);
    }
    if (url.pathname === '/sitemap.xml/' || url.pathname === '/sitemap.txt/') {
      return Response.redirect(`${url.origin}${url.pathname.slice(0, -1)}`, 301);
    }
    const crawlType = CRAWL_TYPES[url.pathname];
    if (crawlType && env.ASSETS) {
      const asset = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), request));
      if (asset.ok) {
        const headers = new Headers(asset.headers);
        headers.set('Content-Type', crawlType);
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Cache-Control', 'public, max-age=300');
        return new Response(asset.body, { status: 200, headers });
      }
    }
    if (env.ASSETS) return withSecurityHeaders(await env.ASSETS.fetch(request));
    return new Response('Not found', { status: 404 });
  },
};

type SocketMeta = { role?: 'host' | 'viewer'; windowStart?: number; count?: number };

export class WatchRoom {
  private ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= WATCH_MAX_SOCKETS) {
      return new Response('room-full', { status: 503 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (isWatchPayloadTooLarge(message)) {
      ws.close(1009, 'too-big');
      return;
    }
    const meta = (ws.deserializeAttachment() as SocketMeta | null) ?? {};
    const rate = allowWatchRate(Date.now(), meta);
    ws.serializeAttachment({ ...meta, windowStart: rate.windowStart, count: rate.count });
    if (!rate.ok) {
      ws.close(1008, 'rate');
      return;
    }
    const parsed = parseClientMessage(typeof message === 'string' ? message : new TextDecoder().decode(message));
    if (!parsed) {
      ws.send(JSON.stringify({ type: 'error', error: 'bad-message' }));
      return;
    }
    const expired = await this.isExpired(Date.now());
    if (expired) {
      await this.expire();
      ws.send(JSON.stringify({ type: 'error', error: 'expired' }));
      ws.close(4000, 'expired');
      return;
    }
    const room = await this.load();
    const result = applyWatchMessage(room, parsed);
    const now = Date.now();
    const createdAt = ((await this.ctx.storage.get<number>('createdAt')) ?? now);
    await this.ctx.storage.put({
      key: result.room.key,
      snap: result.room.snap,
      createdAt,
      lastActive: now,
    });
    const alarmAt = nextRoomAlarm(now, createdAt, now);
    if (alarmAt != null) await this.ctx.storage.setAlarm(alarmAt);
    const latest = (ws.deserializeAttachment() as SocketMeta | null) ?? {};
    if (result.role) latest.role = result.role;
    ws.serializeAttachment(latest);
    ws.send(JSON.stringify(result.reply));
    if (result.broadcast) {
      const payload = JSON.stringify(result.broadcast);
      for (const client of this.ctx.getWebSockets()) {
        const clientMeta = client.deserializeAttachment() as SocketMeta | undefined;
        if (clientMeta?.role === 'viewer') client.send(payload);
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    if (!(await this.isExpired(now))) {
      const createdAt = (await this.ctx.storage.get<number>('createdAt')) ?? now;
      const lastActive = (await this.ctx.storage.get<number>('lastActive')) ?? now;
      const alarmAt = nextRoomAlarm(now, createdAt, lastActive);
      if (alarmAt != null) await this.ctx.storage.setAlarm(alarmAt);
      return;
    }
    await this.expire();
  }

  private async isExpired(now: number): Promise<boolean> {
    const createdAt = await this.ctx.storage.get<number>('createdAt');
    const lastActive = await this.ctx.storage.get<number>('lastActive');
    if (createdAt == null && lastActive == null) return false;
    return nextRoomAlarm(now, createdAt ?? now, lastActive ?? createdAt ?? now) == null;
  }

  private async expire(): Promise<void> {
    const payload = JSON.stringify({ type: 'error', error: 'expired' });
    for (const client of this.ctx.getWebSockets()) {
      try {
        client.send(payload);
        client.close(4000, 'expired');
      } catch {
        // already closed
      }
    }
    await this.ctx.storage.deleteAll();
  }

  private async load(): Promise<RoomState> {
    const stored = await this.ctx.storage.get(['key', 'snap']);
    return {
      key: (stored.get('key') as string | undefined) ?? null,
      snap: sanitizeSpectatorSnapshot(stored.get('snap')) ?? null,
    };
  }
}
