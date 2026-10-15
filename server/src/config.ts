import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Load server/.env (path is resolved relative to this file so it works from src/ and dist/). */
export function loadEnvFile(): void {
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
}

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Never poll the upstream API faster than this, whatever the env says. */
export const MIN_POLL_INTERVAL_MS = 10_000;

/** Allowed range for the application-level heartbeat sent to WebSocket clients. */
export const MIN_HEARTBEAT_MS = 5_000;
export const MAX_HEARTBEAT_MS = 60_000;

/** Allowed range for the total number of concurrent WebSocket connections. */
export const MIN_MAX_CONNECTIONS = 1;
export const MAX_MAX_CONNECTIONS = 10_000;

const envSchema = z.object({
  PANDASCORE_TOKEN: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3001),
  HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .default(30_000)
    .transform((ms) => Math.max(ms, MIN_POLL_INTERVAL_MS)),
  ALLOWED_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().positive().default(10),
  TRUST_PROXY: z
    .preprocess(emptyToUndefined, z.enum(['true', 'false']).default('false'))
    .transform((v) => v === 'true'),
  FORCE_SOURCE: z.preprocess(emptyToUndefined, z.enum(['fixture', 'pandascore']).optional()),
  FIXTURE_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
  HEARTBEAT_MS: z.coerce.number().int().default(20_000),
  MAX_CONNECTIONS: z.coerce.number().int().default(200),
});

export type Config = z.infer<typeof envSchema>;

export function parseConfig(env: NodeJS.ProcessEnv, warn: (message: string) => void = () => {}): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Only report variable names, never values (one of them is a secret).
    const fields = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const config = result.data;
  const heartbeat = Math.min(MAX_HEARTBEAT_MS, Math.max(MIN_HEARTBEAT_MS, config.HEARTBEAT_MS));
  if (heartbeat !== config.HEARTBEAT_MS) {
    warn(
      `HEARTBEAT_MS=${config.HEARTBEAT_MS} is outside ${MIN_HEARTBEAT_MS}-${MAX_HEARTBEAT_MS}; using ${heartbeat}`,
    );
    config.HEARTBEAT_MS = heartbeat;
  }
  const maxConnections = Math.min(MAX_MAX_CONNECTIONS, Math.max(MIN_MAX_CONNECTIONS, config.MAX_CONNECTIONS));
  if (maxConnections !== config.MAX_CONNECTIONS) {
    warn(
      `MAX_CONNECTIONS=${config.MAX_CONNECTIONS} is outside ${MIN_MAX_CONNECTIONS}-${MAX_MAX_CONNECTIONS}; using ${maxConnections}`,
    );
    config.MAX_CONNECTIONS = maxConnections;
  }
  return config;
}
