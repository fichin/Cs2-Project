import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnvFile, parseConfig } from './config.js';
import { createLogger } from './logger.js';
import { Poller } from './poller.js';
import { createRedactor } from './redact.js';
import { FixtureSource } from './sources/fixtureSource.js';
import { selectSource } from './sources/selectSource.js';
import { MatchStore } from './store.js';
import { attachWsHub } from './wsHub.js';

loadEnvFile();

// Redact the token in everything we log, even before the config is validated.
const redact = createRedactor([process.env.PANDASCORE_TOKEN?.trim()]);
const logger = createLogger(redact);

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  process.exit(1);
});

const config = parseConfig(process.env);
const selection = selectSource(config, logger);
const label = selection.source.kind === 'pandascore' ? 'PandaScore (live data)' : 'fixtures (DEMO data)';
logger.info(`Data source: ${label} — ${selection.reason}; polling every ${selection.intervalMs / 1000}s`);

const store = new MatchStore(selection.source.kind);
const server = createServer();
const hub = attachWsHub(server, {
  path: '/ws',
  allowedOrigins: config.ALLOWED_ORIGIN,
  maxConnectionsPerIp: config.MAX_CONNECTIONS_PER_IP,
  trustProxy: config.TRUST_PROXY,
  getSnapshot: () => store.snapshot(),
  logger,
});
server.on(
  'request',
  createApp({ store, clientCount: hub.clientCount, allowedOrigins: config.ALLOWED_ORIGIN }),
);

const poller = new Poller({
  source: selection.source,
  store,
  intervalMs: selection.intervalMs,
  logger,
  fallback: () => ({
    source: new FixtureSource(),
    intervalMs: Math.min(config.FIXTURE_INTERVAL_MS, config.POLL_INTERVAL_MS),
  }),
  events: {
    onDiff: (msg) => hub.broadcast(msg),
    onStatus: () => hub.broadcast(store.status()),
    onReset: () => {
      hub.broadcast(store.snapshot());
      hub.broadcast(store.status());
    },
  },
});

server.listen(config.PORT, config.HOST, () => {
  logger.info(`Listening on http://${config.HOST ?? 'localhost'}:${config.PORT} (WebSocket path /ws)`);
  logger.info(`Allowed origins: ${config.ALLOWED_ORIGIN.join(', ')}`);
  poller.start();
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully`);
  const force = setTimeout(() => {
    logger.warn('Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, 5_000);
  force.unref();
  await poller.stop();
  await hub.close();
  server.closeAllConnections();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
