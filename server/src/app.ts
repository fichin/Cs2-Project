import express, { type Express } from 'express';
import type { MatchStore } from './store.js';

export interface HealthInfo {
  store: MatchStore;
  clientCount: () => number;
  allowedOrigins: readonly string[];
  startedAt?: number;
}

export function createApp({ store, clientCount, allowedOrigins, startedAt = Date.now() }: HealthInfo): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    next();
  });

  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      source: store.source,
      stale: store.stale,
      lastUpdated: store.lastUpdated,
      matches: store.size,
      clients: clientCount(),
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
