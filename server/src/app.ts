import express, { type Express } from 'express';

export interface AppOptions {
  allowedOrigins: readonly string[];
}

export function createApp({ allowedOrigins }: AppOptions): Express {
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

  // Liveness only: anything more (client count, uptime, source) is not needed publicly.
  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
