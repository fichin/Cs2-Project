import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type ServerMessage, parseServerMessage } from '@esports-live/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { silentLogger } from '../src/logger.js';
import { MatchStore } from '../src/store.js';
import { type WsHub, attachWsHub } from '../src/wsHub.js';
import { makeMatch } from './helpers.js';

const ORIGIN = 'http://localhost:5173';

let server: Server;
let hub: WsHub;
let store: MatchStore;
let url: string;
let httpUrl: string;

beforeEach(async () => {
  store = new MatchStore('fixture');
  store.apply([makeMatch({ id: 'a' })]);
  server = createServer();
  hub = attachWsHub(server, {
    path: '/ws',
    allowedOrigins: [ORIGIN],
    maxConnectionsPerIp: 2,
    maxPayloadBytes: 64,
    heartbeatMs: 50,
    getSnapshot: () => store.snapshot(),
    logger: silentLogger,
  });
  server.on('request', createApp({ store, clientCount: hub.clientCount, allowedOrigins: [ORIGIN] }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  url = `ws://127.0.0.1:${port}/ws`;
  httpUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await hub.close();
  await new Promise<void>((r) => server.close(() => r()));
});

/** Connects and buffers messages from the very first frame. */
function connect(origin: string | null = ORIGIN, path = url) {
  const ws = new WebSocket(path, origin ? { origin } : {});
  const messages: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  ws.on('message', (data) => {
    const parsed = parseServerMessage(data.toString());
    if (parsed.ok) messages.push(parsed.message);
    waiters.splice(0).forEach((w) => w());
  });
  const next = async (count: number) => {
    while (messages.length < count) await new Promise<void>((r) => waiters.push(r));
    return messages[count - 1]!;
  };
  return { ws, messages, next };
}

const opened = (ws: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

const rejectedWith = (ws: WebSocket) =>
  new Promise<number>((resolve) => ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0)));

describe('WebSocket hub', () => {
  it('sends a validated snapshot on connect, then broadcasts diffs', async () => {
    const c = connect();
    const snapshot = await c.next(1);
    expect(snapshot).toMatchObject({ type: 'snapshot', source: 'fixture', stale: false });
    expect(snapshot.type === 'snapshot' && snapshot.matches.map((m) => m.id)).toEqual(['a']);

    hub.broadcast({ type: 'diff', v: 1, serverTime: new Date().toISOString(), upserted: [], removed: ['a'] });
    expect(await c.next(2)).toMatchObject({ type: 'diff', removed: ['a'] });
    c.ws.close();
  });

  it('rejects connections from a disallowed or missing Origin', async () => {
    expect(await rejectedWith(connect('https://evil.example').ws)).toBe(403);
    expect(await rejectedWith(connect(null).ws)).toBe(403);
  });

  it('rejects unknown paths', async () => {
    expect(await rejectedWith(connect(ORIGIN, url.replace('/ws', '/nope')).ws)).toBe(404);
  });

  it('limits connections per IP', async () => {
    const a = connect();
    const b = connect();
    await Promise.all([opened(a.ws), opened(b.ws)]);
    expect(await rejectedWith(connect().ws)).toBe(429);
    a.ws.close();
    b.ws.close();
  });

  it('closes clients that send oversized payloads', async () => {
    const c = connect();
    await opened(c.ws);
    const code = await new Promise<number>((resolve) => {
      c.ws.on('close', (closeCode) => resolve(closeCode));
      c.ws.send('x'.repeat(1024));
    });
    expect(code).toBe(1009);
  });

  it('terminates clients that stop answering heartbeats', async () => {
    const c = connect();
    await opened(c.ws);
    // Simulate a dead peer: stop auto-replying to pings.
    (c.ws as unknown as { _receiver: { removeAllListeners(e: string): void } })._receiver.removeAllListeners('ping');
    c.ws.pong = () => {};
    const closed = new Promise<void>((r) => c.ws.on('close', () => r()));
    await closed;
    await vi.waitFor(() => expect(hub.clientCount()).toBe(0));
  });

  it('GET /health reports the source and freshness', async () => {
    const res = await fetch(`${httpUrl}/health`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(await res.json()).toMatchObject({ status: 'ok', source: 'fixture', stale: false, matches: 1 });
  });

  it('close() disconnects clients with 1001 (graceful shutdown)', async () => {
    const c = connect();
    await opened(c.ws);
    const code = new Promise<number>((r) => c.ws.on('close', (cc) => r(cc)));
    await hub.close();
    expect(await code).toBe(1001);
  });
});
