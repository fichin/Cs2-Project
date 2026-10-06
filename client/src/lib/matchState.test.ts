import { describe, expect, it } from 'vitest';
import { makeMatch, snapshot } from '../test/fakes';
import { applyServerMessage, describeChanges, groupMatches, initialLiveState } from './matchState';

describe('applyServerMessage', () => {
  it('snapshot replaces state; diff upserts and removes', () => {
    const a = makeMatch({ id: 'a' });
    const b = makeMatch({ id: 'b' });
    let s = applyServerMessage(initialLiveState, snapshot([a, b]));
    expect(s.hasSnapshot).toBe(true);
    expect(Object.keys(s.matches)).toEqual(['a', 'b']);

    const a2 = { ...a, teams: [{ ...a.teams[0], score: 2 }, a.teams[1]] as typeof a.teams };
    s = applyServerMessage(s, { type: 'diff', v: 1, serverTime: 'T', upserted: [a2], removed: ['b'] });
    expect(s.matches).toEqual({ a: a2 });
    expect(s.lastUpdated).toBe('T');
  });

  it('ignores diffs received before the first snapshot', () => {
    const s = applyServerMessage(initialLiveState, {
      type: 'diff',
      v: 1,
      serverTime: 'T',
      upserted: [makeMatch()],
      removed: [],
    });
    expect(s).toBe(initialLiveState);
  });

  it('status updates source, staleness and message; error is surfaced', () => {
    let s = applyServerMessage(initialLiveState, snapshot([]));
    s = applyServerMessage(s, {
      type: 'status',
      v: 1,
      source: 'pandascore',
      stale: true,
      lastUpdated: null,
      message: 'upstream down',
    });
    expect(s).toMatchObject({ source: 'pandascore', stale: true, statusMessage: 'upstream down' });
    expect(s.lastUpdated).toBe('2026-10-06T15:00:00.000Z'); // kept when status has none
    s = applyServerMessage(s, { type: 'error', v: 1, code: 'X', message: 'boom' });
    expect(s.serverError).toBe('boom');
  });
});

describe('groupMatches', () => {
  it('orders running, then upcoming (soonest first), then results (newest first)', () => {
    const g = groupMatches([
      makeMatch({ id: 'f-old', status: 'finished', endAt: '2026-10-05T10:00:00Z' }),
      makeMatch({ id: 'u-late', status: 'upcoming', scheduledAt: '2026-10-07T10:00:00Z' }),
      makeMatch({ id: 'r', status: 'running' }),
      makeMatch({ id: 'u-soon', status: 'upcoming', scheduledAt: '2026-10-06T18:00:00Z' }),
      makeMatch({ id: 'f-new', status: 'finished', endAt: '2026-10-06T10:00:00Z' }),
      makeMatch({ id: 'u-tbd', status: 'upcoming', scheduledAt: null }),
    ]);
    expect(g.running.map((m) => m.id)).toEqual(['r']);
    expect(g.upcoming.map((m) => m.id)).toEqual(['u-soon', 'u-late', 'u-tbd']);
    expect(g.finished.map((m) => m.id)).toEqual(['f-new', 'f-old']);
  });
});

describe('describeChanges', () => {
  const base = makeMatch({ id: 'a', status: 'running' });

  it('announces score changes, going live and final results', () => {
    const scored = { ...base, teams: [{ ...base.teams[0], score: 2 }, base.teams[1]] as typeof base.teams };
    expect(describeChanges({ a: base }, [scored])).toEqual(['Score update: Alpha Squad 2–0 Bravo Five']);

    const upcoming = { ...base, status: 'upcoming' as const };
    expect(describeChanges({ a: upcoming }, [base])).toEqual(['Now live: Alpha Squad versus Bravo Five']);

    const done = { ...scored, status: 'finished' as const, winnerId: 'a' };
    expect(describeChanges({ a: base }, [done])).toEqual(['Alpha Squad won: Alpha Squad 2–0 Bravo Five']);
  });

  it('stays quiet for new matches and unchanged scores', () => {
    expect(describeChanges({}, [base])).toEqual([]);
    expect(describeChanges({ a: base }, [{ ...base, tournament: 'renamed' }])).toEqual([]);
  });
});
