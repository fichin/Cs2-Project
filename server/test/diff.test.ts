import { describe, expect, it } from 'vitest';
import { diffMatches, isEmptyDiff } from '../src/diff.js';
import { MatchStore } from '../src/store.js';
import { makeMatch, withScore } from './helpers.js';

const toMap = (...ms: ReturnType<typeof makeMatch>[]) => new Map(ms.map((m) => [m.id, m]));

describe('diffMatches', () => {
  it('returns an empty diff for identical state (regardless of order)', () => {
    const a = makeMatch({ id: 'a' });
    const b = makeMatch({ id: 'b' });
    const diff = diffMatches(toMap(a, b), [structuredClone(b), structuredClone(a)]);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('reports new matches as upserted', () => {
    const a = makeMatch({ id: 'a' });
    const b = makeMatch({ id: 'b' });
    expect(diffMatches(toMap(a), [a, b])).toEqual({ upserted: [b], removed: [] });
  });

  it('reports changed scores and status changes', () => {
    const a = makeMatch({ id: 'a' });
    const scored = withScore(a, 1, 0);
    expect(diffMatches(toMap(a), [scored]).upserted).toEqual([scored]);

    const finished = { ...scored, status: 'finished' as const, endAt: '2026-10-06T16:00:00Z' };
    expect(diffMatches(toMap(scored), [finished]).upserted).toEqual([finished]);
  });

  it('detects nested changes such as a logo appearing', () => {
    const a = makeMatch({ id: 'a' });
    const withLogo = { ...a, teams: [{ ...a.teams[0], logoUrl: 'https://x/y.png' }, a.teams[1]] as typeof a.teams };
    expect(diffMatches(toMap(a), [withLogo]).upserted).toHaveLength(1);
  });

  it('reports disappeared matches as removed', () => {
    const a = makeMatch({ id: 'a' });
    const b = makeMatch({ id: 'b' });
    expect(diffMatches(toMap(a, b), [a])).toEqual({ upserted: [], removed: ['b'] });
    expect(diffMatches(toMap(a, b), [])).toEqual({ upserted: [], removed: ['a', 'b'] });
  });

  it('ignores duplicate ids in the next state', () => {
    const a = makeMatch({ id: 'a' });
    expect(diffMatches(new Map(), [a, withScore(a, 5, 5)]).upserted).toEqual([a]);
  });
});

describe('MatchStore', () => {
  it('applies successive states and produces only the changes', () => {
    const store = new MatchStore('fixture');
    const a = makeMatch({ id: 'a' });
    expect(store.apply([a]).upserted).toEqual([a]);
    expect(isEmptyDiff(store.apply([a]))).toBe(true);
    expect(store.apply([withScore(a, 1, 0)]).upserted).toHaveLength(1);
    expect(store.snapshot().matches).toEqual([withScore(a, 1, 0)]);
    expect(store.lastUpdated).not.toBeNull();
  });

  it('reset clears state and switches source', () => {
    const store = new MatchStore('pandascore');
    store.apply([makeMatch()]);
    store.stale = true;
    store.reset('fixture');
    expect(store.snapshot()).toMatchObject({ source: 'fixture', stale: false, matches: [] });
  });
});
