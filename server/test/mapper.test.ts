import { matchSchema } from '@esports-live/shared';
import { describe, expect, it } from 'vitest';
import { mapPandaScoreResponse, mapRawMatch, safeUrl } from '../src/sources/pandascore/mapper.js';
import { rawMatchSchema } from '../src/sources/pandascore/schema.js';
import sample from './fixtures/pandascore-matches.json' with { type: 'json' };

// Saved, trimmed real responses from GET /csgo/matches/{running,upcoming,past}. No network.

describe('PandaScore mapping (saved sample JSON)', () => {
  it('maps every usable match into a valid Match model', () => {
    for (const list of [sample.running, sample.upcoming, sample.past]) {
      const { matches } = mapPandaScoreResponse(list);
      for (const m of matches) expect(matchSchema.safeParse(m).success).toBe(true);
    }
  });

  it('maps running matches with series score, best-of and current game', () => {
    const { matches, skipped } = mapPandaScoreResponse(sample.running);
    expect(skipped).toBe(0);
    const first = matches[0]!;
    const raw = sample.running[0]!;
    expect(first.id).toBe(`ps-${raw.id}`);
    expect(first.status).toBe('running');
    expect(first.source).toBe('pandascore');
    expect(first.bestOf).toBe(raw.number_of_games);
    const runningGame = raw.games.find((g) => g.status === 'running');
    if (runningGame) expect(first.gameNumber).toBe(runningGame.position);
    for (const r of raw.results) {
      const team = first.teams.find((t) => t.id === `ps-team-${r.team_id}`);
      expect(team?.score).toBe(r.score);
    }
    expect(first.league).toBe(raw.league.name);
    expect(first.tournament).toContain(raw.tournament.name);
  });

  it('maps not_started to upcoming with no current game', () => {
    const { matches } = mapPandaScoreResponse(sample.upcoming);
    expect(matches.every((m) => m.status === 'upcoming' && m.gameNumber === null)).toBe(true);
  });

  it('maps finished matches with a winner and drops canceled ones', () => {
    const { matches, skipped } = mapPandaScoreResponse(sample.past);
    expect(skipped).toBe(1); // the canceled match in the sample
    expect(matches.every((m) => m.status === 'finished')).toBe(true);
    const finishedRaw = sample.past.find((m) => m.status === 'finished')!;
    expect(matches[0]!.winnerId).toBe(`ps-team-${finishedRaw.winner_id}`);
  });

  it('tolerates missing fields: no opponents, results, games, league or logos', () => {
    const parsed = rawMatchSchema.parse({ id: 42, status: 'not_started' });
    const m = mapRawMatch(parsed)!;
    expect(m.teams.map((t) => t.name)).toEqual(['TBD', 'TBD']);
    expect(m.teams[0].id).not.toBe(m.teams[1].id);
    expect(m.bestOf).toBeNull();
    expect(m.tournament).toBe('Unknown tournament');
    expect(matchSchema.safeParse(m).success).toBe(true);
  });

  it('converts first_to formats and ignores non best-of formats', () => {
    const base = { id: 1, status: 'running', number_of_games: 3 };
    expect(mapRawMatch(rawMatchSchema.parse({ ...base, match_type: 'first_to' }))!.bestOf).toBe(5);
    expect(mapRawMatch(rawMatchSchema.parse({ ...base, match_type: 'all_games' }))!.bestOf).toBeNull();
  });

  it('skips malformed items instead of failing the whole page', () => {
    const { matches, skipped } = mapPandaScoreResponse([sample.running[0], { id: 'nope' }, null, 'x']);
    expect(matches).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it('rejects a non-array body', () => {
    expect(() => mapPandaScoreResponse({ error: 'x' })).toThrow(TypeError);
  });
});

describe('safeUrl', () => {
  it('allows http(s) and blocks other schemes', () => {
    expect(safeUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:image/png;base64,AAA')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
