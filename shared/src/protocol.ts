import { z } from 'zod';
import { matchSchema, sourceSchema } from './match.js';

/** Bump when the wire format changes in a non-backwards-compatible way. */
export const PROTOCOL_VERSION = 1;

const v = z.literal(PROTOCOL_VERSION);

/** Sent once, right after a client connects. Contains the full current state. */
export const snapshotMessageSchema = z.object({
  type: z.literal('snapshot'),
  v,
  source: sourceSchema,
  stale: z.boolean(),
  lastUpdated: z.string().nullable(),
  /** Human-readable source/freshness note, so late joiners also see it. */
  message: z.string().nullable(),
  serverTime: z.string(),
  matches: z.array(matchSchema),
});

/** Only the matches that changed since the previous poll. */
export const diffMessageSchema = z.object({
  type: z.literal('diff'),
  v,
  serverTime: z.string(),
  upserted: z.array(matchSchema),
  removed: z.array(z.string()),
});

/** Data-freshness / source status changes (e.g. upstream API failing => stale). */
export const statusMessageSchema = z.object({
  type: z.literal('status'),
  v,
  source: sourceSchema,
  stale: z.boolean(),
  lastUpdated: z.string().nullable(),
  message: z.string().nullable(),
});

export const errorMessageSchema = z.object({
  type: z.literal('error'),
  v,
  code: z.string(),
  message: z.string(),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  snapshotMessageSchema,
  diffMessageSchema,
  statusMessageSchema,
  errorMessageSchema,
]);

export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>;
export type DiffMessage = z.infer<typeof diffMessageSchema>;
export type StatusMessage = z.infer<typeof statusMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export type ParseResult = { ok: true; message: ServerMessage } | { ok: false; error: string };

/** Parse and validate a raw WebSocket frame. Never throws. */
export function parseServerMessage(raw: unknown): ParseResult {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'invalid JSON' };
    }
  }
  const result = serverMessageSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'invalid message' };
  }
  return { ok: true, message: result.data };
}

/** Serialize a message after validating it, so the server can never emit a malformed frame. */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(serverMessageSchema.parse(message));
}
