import { z } from 'zod';

export const MATCH_STATUSES = ['running', 'upcoming', 'finished'] as const;
export const SOURCES = ['pandascore', 'fixture'] as const;

export const matchStatusSchema = z.enum(MATCH_STATUSES);
export const sourceSchema = z.enum(SOURCES);

/**
 * True only for absolute http(s) URLs: anything else (javascript:, data:, relative) is unsafe to render.
 * A scheme check rather than `new URL()`, so this shared code needs no DOM or Node types; the server's
 * mapper does the full parse.
 */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s/?#]+\S*$/i.test(value);
}

/**
 * Logo and stream links. A string that isn't an http(s) URL is dropped to null (as the server's
 * mapper already does), so one bad link can't get a whole snapshot or diff rejected.
 */
const httpUrlOrNull = z.preprocess(
  (v) => (typeof v === 'string' && !isHttpUrl(v) ? null : v),
  z.string().refine(isHttpUrl, 'must be an http(s) URL').nullable(),
);

export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  acronym: z.string().nullable(),
  logoUrl: httpUrlOrNull,
  score: z.number().int().nonnegative(),
});

export const matchSchema = z.object({
  id: z.string(),
  status: matchStatusSchema,
  teams: z.tuple([teamSchema, teamSchema]),
  /** 1-based number of the map/game currently being played (running), or last played. */
  gameNumber: z.number().int().positive().nullable(),
  /** Map name when the source knows it (fixtures do; PandaScore free plan does not). */
  mapName: z.string().nullable(),
  bestOf: z.number().int().positive().nullable(),
  tournament: z.string(),
  league: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  beginAt: z.string().nullable(),
  endAt: z.string().nullable(),
  winnerId: z.string().nullable(),
  streamUrl: httpUrlOrNull,
  source: sourceSchema,
});

export type MatchStatus = z.infer<typeof matchStatusSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Match = z.infer<typeof matchSchema>;
