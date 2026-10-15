import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { PROTOCOL_VERSION, type ServerMessage, serializeServerMessage } from '@esports-live/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { createThrottledWarn } from './logThrottle.js';
import type { Logger } from './logger.js';

export interface WsHubOptions {
  path: string;
  allowedOrigins: readonly string[];
  maxConnectionsPerIp: number;
  /** Cap on concurrent connections across all clients; extra upgrades get 503. */
  maxConnections?: number;
  /** Clients only ever need to answer pings; anything bigger is rejected by `ws` (close 1009). */
  maxPayloadBytes?: number;
  /** Protocol-level ping/pong used to terminate dead clients (invisible to browser JS). */
  pingIntervalMs?: number;
  /** Interval of the application-level `heartbeat` message; also announced in every snapshot. */
  heartbeatMs?: number;
  /** Drop clients whose send buffer grows past this (they can't keep up). */
  maxBufferedBytes?: number;
  trustProxy?: boolean;
  /** Rejected-upgrade warnings are logged at most once per this interval (per reason). */
  rejectLogIntervalMs?: number;
  getSnapshot: () => ServerMessage;
  logger: Logger;
}

export interface WsHub {
  broadcast(message: ServerMessage): void;
  clientCount(): number;
  close(): Promise<void>;
}

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  ip?: string;
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    // Clients can send their own X-Forwarded-For; only the LAST entry is added by our proxy (Render).
    const fwd = req.headers['x-forwarded-for'];
    const entries = (Array.isArray(fwd) ? fwd.join(',') : (fwd ?? ''))
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const last = entries.at(-1);
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function reject(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function attachWsHub(server: Server, opts: WsHubOptions): WsHub {
  const {
    logger,
    maxPayloadBytes = 1024,
    pingIntervalMs = 30_000,
    heartbeatMs = 20_000,
    maxBufferedBytes = 1024 * 1024,
    trustProxy = false,
    maxConnections = 200,
    rejectLogIntervalMs = 60_000,
  } = opts;
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxPayloadBytes, perMessageDeflate: false });
  const perIp = new Map<string, number>();
  const allowed = new Set(opts.allowedOrigins);
  const warnRejected = createThrottledWarn(logger, rejectLogIntervalMs);

  const send = (ws: WebSocket, frame: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > maxBufferedBytes) {
      ws.terminate();
      return;
    }
    ws.send(frame);
  };

  /** Tell clients the heartbeat interval so they can size their watchdog. */
  const withHeartbeat = (message: ServerMessage): ServerMessage =>
    message.type === 'snapshot' ? { ...message, heartbeatMs } : message;

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== opts.path) return reject(socket, 404, 'Not Found');

    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) {
      warnRejected('origin', `Rejected WebSocket upgrade from disallowed origin: ${origin ?? '(none)'}`);
      return reject(socket, 403, 'Forbidden');
    }

    if (wss.clients.size >= maxConnections) {
      warnRejected('capacity', `Rejected WebSocket upgrade: server is at its connection limit (${maxConnections})`);
      return reject(socket, 503, 'Service Unavailable');
    }

    const ip = clientIp(req, trustProxy);
    const count = perIp.get(ip) ?? 0;
    if (count >= opts.maxConnectionsPerIp) {
      warnRejected('per-ip', `Rejected WebSocket upgrade: too many connections from one IP (${count})`);
      return reject(socket, 429, 'Too Many Requests');
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, ip));
  };
  server.on('upgrade', onUpgrade);

  wss.on('connection', (ws: TrackedSocket, _req: IncomingMessage, ip: string) => {
    ws.isAlive = true;
    ws.ip = ip;
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);

    ws.on('pong', () => {
      ws.isAlive = true;
    });
    // The protocol is server -> client only; inbound messages are ignored.
    ws.on('message', () => {});
    ws.on('error', (err) => logger.warn('WebSocket client error', err.message));
    ws.on('close', () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
    });

    send(ws, serializeServerMessage(withHeartbeat(opts.getSnapshot())));
  });

  const broadcast = (message: ServerMessage) => {
    if (wss.clients.size === 0) return;
    const frame = serializeServerMessage(withHeartbeat(message)); // serialize once for all clients
    for (const client of wss.clients) send(client, frame);
  };

  // Ping: a client that didn't answer the previous ping is considered dead.
  const pingTimer = setInterval(() => {
    for (const client of wss.clients as Set<TrackedSocket>) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, pingIntervalMs);
  pingTimer.unref();

  // Heartbeat: browsers can't see pings, so send a tiny message clients can use to detect silent drops.
  const heartbeatTimer = setInterval(() => {
    broadcast({ type: 'heartbeat', v: PROTOCOL_VERSION, serverTime: new Date().toISOString() });
  }, heartbeatMs);
  heartbeatTimer.unref();

  return {
    broadcast,
    clientCount: () => wss.clients.size,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(pingTimer);
        clearInterval(heartbeatTimer);
        server.off('upgrade', onUpgrade);
        for (const client of wss.clients) client.close(1001, 'Server shutting down');
        // Give clients a moment to receive the close frame, then force it.
        const force = setTimeout(() => {
          for (const client of wss.clients) client.terminate();
        }, 1_000);
        force.unref();
        wss.close(() => {
          clearTimeout(force);
          resolve();
        });
      }),
  };
}
