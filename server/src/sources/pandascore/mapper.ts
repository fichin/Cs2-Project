import type { Match, MatchStatus, Team } from '@esports-live/shared';
import { rawMatchSchema, type RawMatch } from './schema.js';

const STATUS_MAP: Record<string, MatchStatus | undefined> = {
  running: 'running',
  not_started: 'upcoming',
  postponed: 'upcoming',
  finished: 'finished',
  // "canceled" and unknown statuses are dropped.
};

/** Only allow http(s) URLs through to the browser (no javascript:, data:, etc.). */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function bestOfFor(raw: RawMatch): number | null {
  const n = raw.number_of_games;
  if (!n || n < 1) return null;
  switch (raw.match_type) {
    case 'best_of':
    case 'ow_best_of':
      return n;
    case 'first_to':
      return n * 2 - 1;
    default:
      return null; // e.g. "all_games": not a best-of format
  }
}

function gameNumberFor(raw: RawMatch, status: MatchStatus): number | null {
  if (status === 'upcoming') return null;
  const games = raw.games ?? [];
  const running = games.find((g) => g.status === 'running');
  if (running?.position) return running.position;
  const played = games.filter((g) => g.status === 'finished' || g.finished).length;
  return played > 0 ? played : null;
}

function tbd(matchId: number, index: number): Team {
  return { id: `ps-tbd-${matchId}-${index}`, name: 'TBD', acronym: null, logoUrl: null, score: 0 };
}

function teamsFor(raw: RawMatch): [Team, Team] {
  const scores = new Map<number, number>();
  for (const r of raw.results ?? []) {
    if (typeof r.team_id === 'number') scores.set(r.team_id, Math.max(0, Math.trunc(r.score ?? 0)));
  }
  const teams = (raw.opponents ?? [])
    .map((o) => o.opponent)
    .filter((t): t is NonNullable<typeof t> => !!t)
    .slice(0, 2)
    .map<Team>((t) => ({
      id: `ps-team-${t.id}`,
      name: t.name?.trim() || t.acronym?.trim() || 'TBD',
      acronym: t.acronym?.trim() || null,
      logoUrl: safeUrl(t.image_url ?? t.dark_mode_image_url),
      score: scores.get(t.id) ?? 0,
    }));
  return [teams[0] ?? tbd(raw.id, 0), teams[1] ?? tbd(raw.id, 1)];
}

function mainStream(raw: RawMatch): string | null {
  const streams = raw.streams_list ?? [];
  const pick =
    streams.find((s) => s.main && s.language === 'en') ?? streams.find((s) => s.main) ?? streams[0] ?? null;
  return safeUrl(pick?.raw_url);
}

function tournamentFor(raw: RawMatch): string {
  const parts = [raw.serie?.full_name ?? raw.serie?.name, raw.tournament?.name].filter(
    (p): p is string => !!p && p.trim() !== '',
  );
  return parts.length > 0 ? parts.join(' · ') : raw.name?.trim() || 'Unknown tournament';
}

/** Map one already-validated PandaScore match into our model; returns null for unusable ones. */
export function mapRawMatch(raw: RawMatch): Match | null {
  const status = raw.status ? STATUS_MAP[raw.status] : undefined;
  if (!status) return null;
  const teams = teamsFor(raw);
  return {
    id: `ps-${raw.id}`,
    status,
    teams,
    gameNumber: gameNumberFor(raw, status),
    mapName: null, // map names need the paid real-time/historical data
    bestOf: bestOfFor(raw),
    tournament: tournamentFor(raw),
    league: raw.league?.name ?? null,
    scheduledAt: raw.scheduled_at ?? null,
    beginAt: raw.begin_at ?? null,
    endAt: raw.end_at ?? null,
    winnerId: typeof raw.winner_id === 'number' ? `ps-team-${raw.winner_id}` : null,
    streamUrl: mainStream(raw),
    source: 'pandascore',
  };
}

export interface MapResult {
  matches: Match[];
  /** Items that failed validation or could not be mapped (logged, not fatal). */
  skipped: number;
}

/** Validate each element independently so one malformed match doesn't discard the page. */
export function mapPandaScoreResponse(body: unknown): MapResult {
  if (!Array.isArray(body)) throw new TypeError('Expected an array of matches');
  const matches: Match[] = [];
  let skipped = 0;
  for (const item of body) {
    const parsed = rawMatchSchema.safeParse(item);
    const mapped = parsed.success ? mapRawMatch(parsed.data) : null;
    if (mapped) matches.push(mapped);
    else skipped += 1;
  }
  return { matches, skipped };
}
