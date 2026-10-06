import { z } from 'zod';

export const MATCH_STATUSES = ['running', 'upcoming', 'finished'] as const;
export const SOURCES = ['pandascore', 'fixture'] as const;

export const matchStatusSchema = z.enum(MATCH_STATUSES);
export const sourceSchema = z.enum(SOURCES);

export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  acronym: z.string().nullable(),
  logoUrl: z.string().nullable(),
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
  streamUrl: z.string().nullable(),
  source: sourceSchema,
});

export type MatchStatus = z.infer<typeof matchStatusSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Match = z.infer<typeof matchSchema>;
