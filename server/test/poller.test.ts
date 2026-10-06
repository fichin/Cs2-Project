import type { Match } from '@esports-live/shared';
import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../src/logger.js';
import { Poller } from '../src/poller.js';
import { Backoff } from '../src/rateLimit.js';
import { FixtureSource } from '../src/sources/fixtureSource.js';
import { type MatchSource, SourceError } from '../src/sources/MatchSource.js';
import { MatchStore } from '../src/store.js';
import { makeMatch, withScore } from './helpers.js';

function scripted(results: Array<Match[] | Error>): MatchSource {
  let i = 0;
  return {
    kind: 'pandascore',
    fetchMatches: async () => {
      const r = results[Math.min(i++, results.length - 1)]!;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

function setup(source: MatchSource, fallback?: () => { source: MatchSource; intervalMs: number }) {
  const store = new MatchStore(source.kind);
  const events = { onDiff: vi.fn(), onStatus: vi.fn(), onReset: vi.fn() };
  const poller = new Poller({
    source,
    store,
    intervalMs: 30_000,
    logger: silentLogger,
    events,
    fallback,
    backoff: new Backoff({ baseMs: 30_000, maxMs: 600_000, random: () => 1 }),
  });
  return { store, events, poller };
}

describe('Poller', () => {
  it('broadcasts only diffs, and nothing when unchanged', async () => {
    const a = makeMatch({ id: 'a' });
    const { events, poller } = setup(scripted([[a], [a], [withScore(a, 1, 0)]]));
    await poller.pollOnce();
    expect(events.onDiff).toHaveBeenCalledTimes(1);
    await poller.pollOnce();
    expect(events.onDiff).toHaveBeenCalledTimes(1);
    await poller.pollOnce();
    expect(events.onDiff).toHaveBeenCalledTimes(2);
    expect(events.onDiff.mock.calls[1]![0]).toMatchObject({ type: 'diff', upserted: [withScore(a, 1, 0)], removed: [] });
  });

  it('keeps the last good state and flags it stale on failure, then recovers', async () => {
    const a = makeMatch({ id: 'a' });
    const { store, events, poller } = setup(
      scripted([[a], new SourceError('HTTP 503', 'UPSTREAM'), new SourceError('HTTP 503', 'UPSTREAM'), [a]]),
    );
    await poller.pollOnce();
    const delay = await poller.pollOnce();
    expect(store.stale).toBe(true);
    expect(store.snapshot().matches).toEqual([a]);
    expect(events.onStatus).toHaveBeenCalledTimes(1);
    expect(delay).toBeGreaterThanOrEqual(30_000);

    const delay2 = await poller.pollOnce();
    expect(delay2).toBeGreaterThan(delay); // exponential backoff
    expect(events.onStatus).toHaveBeenCalledTimes(1); // no duplicate status broadcast

    expect(await poller.pollOnce()).toBe(30_000);
    expect(store.stale).toBe(false);
    expect(events.onStatus).toHaveBeenCalledTimes(2);
  });

  it('never schedules faster than the interval, and respects retryAfter hints', async () => {
    const { poller } = setup(scripted([new SourceError('429', 'RATE_LIMITED', 900_000)]));
    expect(await poller.pollOnce()).toBe(900_000);
  });

  it('falls back to fixtures when the token is rejected', async () => {
    const { store, events, poller } = setup(scripted([new SourceError('rejected', 'AUTH')]), () => ({
      source: new FixtureSource(),
      intervalMs: 5_000,
    }));
    expect(await poller.pollOnce()).toBe(0);
    expect(store.source).toBe('fixture');
    expect(poller.currentSource.kind).toBe('fixture');
    expect(events.onReset).toHaveBeenCalledTimes(1);
    expect(await poller.pollOnce()).toBe(5_000);
    expect(store.size).toBeGreaterThan(0);
  });

  it('start/stop runs the loop on timers', async () => {
    vi.useFakeTimers();
    try {
      const a = makeMatch({ id: 'a' });
      const source = scripted([[a]]);
      const spy = vi.spyOn(source, 'fetchMatches');
      const { poller } = setup(source);
      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(spy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(spy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(spy).toHaveBeenCalledTimes(2);
      await poller.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
