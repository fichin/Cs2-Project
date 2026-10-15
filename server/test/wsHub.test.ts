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
    pingIntervalMs: 50,
    heartbeatMs: 60_000, // long enough that heartbeats never interleave with these tests' messages
    getSnapshot: () => store.snapshot(),
    logger: silentLogger,
  });
  server.on('request', createApp({ allowedOrigins: [ORIGIN] }));
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

  it('GET /health returns only { status: "ok" }', async () => {
    const res = await fetch(`${httpUrl}/health`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('close() disconnects clients with 1001 (graceful shutdown)', async () => {
    const c = connect();
    await opened(c.ws);
    const code = new Promise<number>((r) => c.ws.on('close', (cc) => r(cc)));
    await hub.close();
    expect(await code).toBe(1001);
  });

  it('adds heartbeatMs to broadcast snapshots too (e.g. after a source switch)', async () => {
    const c = connect();
    await c.next(1);
    hub.broadcast(store.snapshot());
    expect(await c.next(2)).toMatchObject({ type: 'snapshot', heartbeatMs: 60_000 });
    c.ws.close();
  });
});

describe('WebSocket hub heartbeat', () => {
  const HEARTBEAT_MS = 40;

  /** A separate hub with a short heartbeat, so the main suite's message order stays predictable. */
  async function startHeartbeatHub() {
    const hbServer = createServer();
    const hbHub = attachWsHub(hbServer, {
      path: '/ws',
      allowedOrigins: [ORIGIN],
      maxConnectionsPerIp: 2,
      heartbeatMs: HEARTBEAT_MS,
      getSnapshot: () => store.snapshot(),
      logger: silentLogger,
    });
    await new Promise<void>((r) => hbServer.listen(0, '127.0.0.1', r));
    const { port } = hbServer.address() as AddressInfo;
    const stop = async () => {
      await hbHub.close();
      await new Promise<void>((r) => hbServer.close(() => r()));
    };
    return { hub: hbHub, url: `ws://127.0.0.1:${port}/ws`, stop };
  }

  it("a new client's first message is a snapshot announcing the configured heartbeatMs", async () => {
    const hb = await startHeartbeatHub();
    try {
      const c = connect(ORIGIN, hb.url);
      expect(await c.next(1)).toMatchObject({ type: 'snapshot', heartbeatMs: HEARTBEAT_MS });
      c.ws.close();
    } finally {
      await hb.stop();
    }
  });

  it('sends a heartbeat message after HEARTBEAT_MS', async () => {
    const hb = await startHeartbeatHub();
    try {
      const c = connect(ORIGIN, hb.url);
      await c.next(1);
      const started = Date.now();
      const msg = await c.next(2);
      expect(msg).toMatchObject({ type: 'heartbeat', v: 1 });
      expect(msg.type === 'heartbeat' && Number.isNaN(Date.parse(msg.serverTime))).toBe(false);
      expect(Date.now() - started).toBeLessThan(HEARTBEAT_MS * 10);
      c.ws.close();
    } finally {
      await hb.stop();
    }
  });

  it('clears the heartbeat interval on close, so it cannot leak into other tests', async () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval');
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    try {
      const hb = await startHeartbeatHub();
      const timers = setSpy.mock.results.map((r) => r.value);
      expect(timers).toHaveLength(2); // ping + heartbeat
      await hb.stop();
      const cleared = clearSpy.mock.calls.map(([t]) => t);
      for (const t of timers) expect(cleared).toContain(t);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });
});

/** A separate hub with custom options, for tests that need their own limits. */
async function startTestHub(overrides: Partial<Parameters<typeof attachWsHub>[1]> = {}) {
  const testServer = createServer();
  const testHub = attachWsHub(testServer, {
    path: '/ws',
    allowedOrigins: [ORIGIN],
    maxConnectionsPerIp: 10,
    heartbeatMs: 60_000,
    getSnapshot: () => store.snapshot(),
    logger: silentLogger,
    ...overrides,
  });
  await new Promise<void>((r) => testServer.listen(0, '127.0.0.1', r));
  const { port } = testServer.address() as AddressInfo;
  const stop = async () => {
    await testHub.close();
    await new Promise<void>((r) => testServer.close(() => r()));
  };
  return { hub: testHub, url: `ws://127.0.0.1:${port}/ws`, stop };
}

/** Open `n` connections at once and count how many were accepted vs rejected (by HTTP status). */
async function openMany(url: string, n: number, headersFor: (i: number) => Record<string, string> = () => ({})) {
  const sockets: WebSocket[] = [];
  const results = await Promise.all(
    Array.from(
      { length: n },
      (_, i) =>
        new Promise<number>((resolve) => {
          const ws = new WebSocket(url, { origin: ORIGIN, headers: headersFor(i) });
          sockets.push(ws);
          ws.once('open', () => resolve(101));
          ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
          ws.once('error', () => resolve(-1));
        }),
    ),
  );
  for (const ws of sockets) ws.terminate();
  return { accepted: results.filter((s) => s === 101).length, statuses: results };
}

describe('WebSocket hub behind a proxy (TRUST_PROXY)', () => {
  it('limits per IP by the LAST X-Forwarded-For entry, so a spoofed first entry does not help', async () => {
    const t = await startTestHub({ trustProxy: true, maxConnectionsPerIp: 10 });
    try {
      // Each client claims a different "first" IP, but the proxy-appended last entry is the same.
      const { accepted, statuses } = await openMany(t.url, 12, (i) => ({
        'X-Forwarded-For': `10.0.0.${i}, 203.0.113.7`,
      }));
      expect(accepted).toBe(10);
      expect(statuses.filter((s) => s === 429)).toHaveLength(2);
    } finally {
      await t.stop();
    }
  });

  it('falls back to the socket address when X-Forwarded-For is missing or empty', async () => {
    const t = await startTestHub({ trustProxy: true, maxConnectionsPerIp: 2 });
    try {
      const { accepted } = await openMany(t.url, 3, (i): Record<string, string> => (i === 0 ? { 'X-Forwarded-For': ' , ' } : {}));
      expect(accepted).toBe(2); // all three count as 127.0.0.1
    } finally {
      await t.stop();
    }
  });
});

describe('WebSocket hub total connection cap (MAX_CONNECTIONS)', () => {
  it('rejects upgrades with 503 once the cap is reached, without crashing', async () => {
    const t = await startTestHub({ maxConnections: 3, maxConnectionsPerIp: 100 });
    try {
      const { accepted, statuses } = await openMany(t.url, 5);
      expect(accepted).toBe(3);
      expect(statuses.filter((s) => s === 503)).toHaveLength(2);
    } finally {
      await t.stop();
    }
  });

  it('accepts new connections again after others disconnect', async () => {
    const t = await startTestHub({ maxConnections: 1, maxConnectionsPerIp: 100 });
    try {
      const first = connect(ORIGIN, t.url);
      await first.next(1);
      expect((await openMany(t.url, 1)).statuses).toEqual([503]);

      first.ws.close();
      await vi.waitFor(() => expect(t.hub.clientCount()).toBe(0));
      expect((await openMany(t.url, 1)).accepted).toBe(1);
    } finally {
      await t.stop();
    }
  });
});

describe('WebSocket hub rejection logging', () => {
  it('logs a flood of disallowed-origin upgrades only once per interval', async () => {
    const lines: string[] = [];
    const logger = { info: () => {}, warn: (m: string) => lines.push(m), error: () => {} };
    const t = await startTestHub({ logger, rejectLogIntervalMs: 60_000 });
    try {
      const results = await Promise.all(
        Array.from(
          { length: 20 },
          () =>
            new Promise<number>((resolve) => {
              const ws = new WebSocket(t.url, { origin: 'https://evil.example' });
              ws.once('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
              ws.once('error', () => resolve(-1));
            }),
        ),
      );
      expect(results.every((s) => s === 403)).toBe(true);
      expect(lines.filter((l) => l.includes('disallowed origin'))).toHaveLength(1);
    } finally {
      await t.stop();
    }
  });
});
