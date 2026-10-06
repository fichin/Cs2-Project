import { z } from 'zod';

/*
 * Lenient schemas for the subset of PandaScore's match object we use.
 * Verified against the docs and a live response from GET /csgo/matches/{running,upcoming,past}.
 * PandaScore sends `null` for blank fields; we additionally tolerate missing ones (`nullish`).
 * Unknown fields are stripped.
 */

const str = z.string().nullish();
const num = z.number().nullish();

export const rawTeamSchema = z.object({
  id: z.number(),
  name: str,
  acronym: str,
  image_url: str,
  dark_mode_image_url: str,
});

export const rawOpponentSchema = z.object({
  type: str,
  opponent: rawTeamSchema.nullish(),
});

export const rawResultSchema = z.object({
  team_id: num,
  score: num,
});

export const rawGameSchema = z.object({
  id: num,
  position: num,
  status: str,
  finished: z.boolean().nullish(),
});

export const rawStreamSchema = z.object({
  main: z.boolean().nullish(),
  official: z.boolean().nullish(),
  language: str,
  raw_url: str,
});

const named = z.object({ name: str }).nullish();

export const rawMatchSchema = z.object({
  id: z.number(),
  name: str,
  status: str,
  scheduled_at: str,
  begin_at: str,
  end_at: str,
  match_type: str,
  number_of_games: num,
  winner_id: num,
  opponents: z.array(rawOpponentSchema).nullish(),
  results: z.array(rawResultSchema).nullish(),
  games: z.array(rawGameSchema).nullish(),
  league: named,
  serie: z.object({ name: str, full_name: str }).nullish(),
  tournament: named,
  streams_list: z.array(rawStreamSchema).nullish(),
});

export type RawMatch = z.infer<typeof rawMatchSchema>;
