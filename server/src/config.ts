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
});

export type Config = z.infer<typeof envSchema>;

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Only report variable names, never values (one of them is a secret).
    const fields = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return result.data;
}
