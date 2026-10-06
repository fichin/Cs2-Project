import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../src/logger.js';
import { Backoff, RequestBudget } from '../src/rateLimit.js';
import { SourceError } from '../src/sources/MatchSource.js';
import { ENDPOINTS, PandaScoreSource, SAFE_REQUESTS_PER_HOUR } from '../src/sources/pandascore/pandascoreSource.js';
import sample from './fixtures/pandascore-matches.json' with { type: 'json' };
import { jsonResponse } from './helpers.js';

const TOKEN = 'fake_token_for_tests_0123456789';

type Handler = (endpoint: string) => Response | Promise<Response>;

function setup(handler: Handler, opts: { budget?: RequestBudget } = {}) {
  let now = 1_000_000;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const endpoint = new URL(url).pathname.split('/').pop()!;
    return handler(endpoint);
  });
  const source = new PandaScoreSource({
    token: TOKEN,
    logger: silentLogger,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => now,
    budget: opts.budget,
    backoff: new Backoff({ baseMs: 1000, maxMs: 60_000, random: () => 1 }),
  });
  return {
    source,
    calls,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ok: Handler = (endpoint) =>
  jsonResponse(sample[endpoint as 'running' | 'upcoming' | 'past'], 200, { 'X-Rate-Limit-Remaining': '900' });

describe('PandaScoreSource', () => {
  it('stays well under the documented free-plan limit (1,000 req/h)', () => {
    expect(SAFE_REQUESTS_PER_HOUR).toBeLessThanOrEqual(700);
  });

  it('sends the token only in the Authorization header, never in the URL', async () => {
    const { source, calls } = setup(ok);
    await source.fetchMatches();
    expect(calls).toHaveLength(3);
    for (const { url, init } of calls) {
      expect(url).not.toContain(TOKEN);
      expect(url).not.toMatch(/[?&]token=/);
      expect(url).toMatch(/^https:\/\/api\.pandascore\.co\/csgo\/matches\/(running|upcoming|past)\?/);
      expect(url).toContain('filter%5Bvideogame_title%5D=cs-2');
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    }
  });

  it('merges running, upcoming and past into normalized matches', async () => {
    const { source } = setup(ok);
    const matches = await source.fetchMatches();
    const statuses = new Set(matches.map((m) => m.status));
    expect(statuses).toEqual(new Set(['running', 'upcoming', 'finished']));
    expect(matches.every((m) => m.source === 'pandascore')).toBe(true);
    expect(new Set(matches.map((m) => m.id)).size).toBe(matches.length);
  });

  it('caches upcoming/past responses and only re-fetches running every poll', async () => {
    const { source, calls, advance } = setup(ok);
    await source.fetchMatches();
    advance(30_000);
    await source.fetchMatches();
    expect(calls.map((c) => new URL(c.url).pathname.split('/').pop())).toEqual([
      'running',
      'upcoming',
      'past',
      'running',
    ]);
    advance(ENDPOINTS.upcoming.ttlMs);
    await source.fetchMatches();
    expect(calls).toHaveLength(7);
  });

  it('backs off exponentially after a 429 and does not call the API during the backoff', async () => {
    let fail = true;
    const { source, calls, advance } = setup((e) => (fail ? jsonResponse({}, 429) : ok(e)));
    await expect(source.fetchMatches()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    const afterFirst = calls.length;

    // Inside the backoff window: no network calls at all.
    await expect(source.fetchMatches()).rejects.toMatchObject({ code: 'BACKING_OFF' });
    expect(calls.length).toBe(afterFirst);

    fail = false;
    advance(60_000);
    await expect(source.fetchMatches()).resolves.toBeInstanceOf(Array);
  });

  it('honours Retry-After when it is longer than the backoff', async () => {
    const { source } = setup(() => jsonResponse({}, 429, { 'Retry-After': '120' }));
    const err = (await source.fetchMatches().catch((e: unknown) => e)) as SourceError;
    expect(err).toBeInstanceOf(SourceError);
    expect(err.retryAfterMs).toBe(120_000);
  });

  it('treats 5xx as retryable upstream errors', async () => {
    const { source } = setup(() => jsonResponse('oops', 503));
    await expect(source.fetchMatches()).rejects.toMatchObject({ code: 'UPSTREAM' });
  });

  it('reports a rejected token as AUTH without leaking it', async () => {
    const { source } = setup(() => jsonResponse({ error: 'Token is invalid' }, 401));
    const err = (await source.fetchMatches().catch((e: unknown) => e)) as SourceError;
    expect(err.code).toBe('AUTH');
    expect(err.message).not.toContain(TOKEN);
  });

  it('falls back to cached upcoming/past data when only those endpoints fail', async () => {
    let failSecondary = false;
    const { source, advance } = setup((e) => (failSecondary && e !== 'running' ? jsonResponse({}, 500) : ok(e)));
    const first = await source.fetchMatches();
    failSecondary = true;
    advance(ENDPOINTS.upcoming.ttlMs + 1);
    const second = await source.fetchMatches();
    expect(second.map((m) => m.id).sort()).toEqual(first.map((m) => m.id).sort());
  });

  it('refuses to exceed the local request budget', async () => {
    const budget = new RequestBudget(2, 60 * 60_000);
    const { source, calls } = setup(ok, { budget });
    await expect(source.fetchMatches()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(calls).toHaveLength(2);
  });

  it('maps network failures and invalid JSON to typed, secret-free errors', async () => {
    const net = setup(() => {
      throw new TypeError(`fetch failed for token ${TOKEN}`);
    });
    const err = (await net.source.fetchMatches().catch((e: unknown) => e)) as SourceError;
    expect(err.code).toBe('NETWORK');
    expect(err.message).not.toContain(TOKEN);

    const bad = setup(() => new Response('<html>', { status: 200 }));
    await expect(bad.source.fetchMatches()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
