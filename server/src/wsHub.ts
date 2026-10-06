import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { type ServerMessage, serializeServerMessage } from '@esports-live/shared';
import { WebSocket, WebSocketServer } from 'ws';
import type { Logger } from './logger.js';

export interface WsHubOptions {
  path: string;
  allowedOrigins: readonly string[];
  maxConnectionsPerIp: number;
  /** Clients only ever need to answer pings; anything bigger is rejected by `ws` (close 1009). */
  maxPayloadBytes?: number;
  heartbeatMs?: number;
  /** Drop clients whose send buffer grows past this (they can't keep up). */
  maxBufferedBytes?: number;
  trustProxy?: boolean;
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

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
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
    heartbeatMs = 30_000,
    maxBufferedBytes = 1024 * 1024,
    trustProxy = false,
  } = opts;
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxPayloadBytes, perMessageDeflate: false });
  const perIp = new Map<string, number>();
  const allowed = new Set(opts.allowedOrigins);

  const send = (ws: WebSocket, frame: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > maxBufferedBytes) {
      ws.terminate();
      return;
    }
    ws.send(frame);
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== opts.path) return reject(socket, 404, 'Not Found');

    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) {
      logger.warn(`Rejected WebSocket upgrade from disallowed origin: ${origin ?? '(none)'}`);
      return reject(socket, 403, 'Forbidden');
    }

    const ip = clientIp(req, trustProxy);
    const count = perIp.get(ip) ?? 0;
    if (count >= opts.maxConnectionsPerIp) {
      logger.warn(`Rejected WebSocket upgrade: too many connections from one IP (${count})`);
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

    send(ws, serializeServerMessage(opts.getSnapshot()));
  });

  // Heartbeat: a client that didn't answer the previous ping is considered dead.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients as Set<TrackedSocket>) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  return {
    broadcast(message) {
      if (wss.clients.size === 0) return;
      const frame = serializeServerMessage(message); // serialize once for all clients
      for (const client of wss.clients) send(client, frame);
    },
    clientCount: () => wss.clients.size,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
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
