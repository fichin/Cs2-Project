import type { Match } from '@esports-live/shared';

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    status: 'running',
    teams: [
      { id: 'a', name: 'Alpha', acronym: 'ALP', logoUrl: null, score: 0 },
      { id: 'b', name: 'Bravo', acronym: 'BRV', logoUrl: null, score: 0 },
    ],
    gameNumber: 1,
    mapName: null,
    bestOf: 3,
    tournament: 'Test Cup',
    league: null,
    scheduledAt: '2026-10-06T14:00:00.000Z',
    beginAt: '2026-10-06T14:00:00.000Z',
    endAt: null,
    winnerId: null,
    streamUrl: null,
    source: 'fixture',
    ...overrides,
  };
}

export function withScore(match: Match, a: number, b: number): Match {
  return {
    ...match,
    teams: [
      { ...match.teams[0], score: a },
      { ...match.teams[1], score: b },
    ],
  };
}

/** Minimal fetch Response stand-in. */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
