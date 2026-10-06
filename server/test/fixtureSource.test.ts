import { matchSchema } from '@esports-live/shared';
import { describe, expect, it } from 'vitest';
import { FIXTURE_CYCLE_MS, FixtureSource, MAP_MS } from '../src/sources/fixtureSource.js';

const T0 = Date.parse('2026-10-06T12:00:00Z');

describe('FixtureSource', () => {
  const src = new FixtureSource();

  it('produces valid, clearly labeled demo matches in every state', () => {
    const matches = src.matchesAt(T0);
    expect(matches.length).toBeGreaterThan(5);
    for (const m of matches) {
      expect(matchSchema.safeParse(m).success).toBe(true);
      expect(m.source).toBe('fixture');
    }
    const statuses = new Set(matches.map((m) => m.status));
    expect(statuses.has('upcoming')).toBe(true);
    expect(statuses.has('finished')).toBe(true);
  });

  it('is deterministic for a given time', () => {
    expect(src.matchesAt(T0)).toEqual(src.matchesAt(T0));
  });

  it('changes over time (scores/status move as maps are played)', () => {
    const snapshots = Array.from({ length: 10 }, (_, i) => JSON.stringify(src.matchesAt(T0 + i * MAP_MS)));
    expect(new Set(snapshots).size).toBeGreaterThan(5);
  });

  it('always has at least one running match across a full cycle', () => {
    for (let t = T0; t < T0 + FIXTURE_CYCLE_MS; t += 30_000) {
      const running = src.matchesAt(t).filter((m) => m.status === 'running');
      expect(running.length).toBeGreaterThan(0);
    }
  });

  it('finished matches have a winner whose series score is the majority', () => {
    for (const m of src.matchesAt(T0).filter((x) => x.status === 'finished')) {
      const winner = m.teams.find((t) => t.id === m.winnerId)!;
      expect(winner.score).toBe(Math.ceil(m.bestOf! / 2));
    }
  });
});
