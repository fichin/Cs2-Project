import type { Match } from '@esports-live/shared';
import type { Logger } from '../../logger.js';
import { Backoff, type Clock, RequestBudget, parseRetryAfter } from '../../rateLimit.js';
import { type MatchSource, SourceError } from '../MatchSource.js';
import { mapPandaScoreResponse } from './mapper.js';

/*
 * Facts verified in the PandaScore docs (developers.pandascore.co):
 *  - REST base URL https://api.pandascore.co; auth via `Authorization: Bearer <token>`
 *    (the `?token=` alternative is deliberately NOT used so the token never appears in URLs).
 *  - Counter-Strike 2 still lives under the `/csgo` slug; CS2 vs CS:GO is distinguished by
 *    `filter[videogame_title]=cs-2` (videogame_title id 13).
 *  - Endpoints: /csgo/matches/running, /csgo/matches/upcoming, /csgo/matches/past.
 *  - Pagination: page[number] / page[size] (default 50, max 100); X-Total header.
 *  - "Schedules, Results & Context Data" (free) plan: 1,000 requests/hour;
 *    remaining requests in the X-Rate-Limit-Remaining header.
 */

export const PANDASCORE_BASE_URL = 'https://api.pandascore.co';
export const FREE_PLAN_REQUESTS_PER_HOUR = 1_000;
/** Use at most 60% of the documented limit, leaving headroom for restarts and manual testing. */
export const SAFE_REQUESTS_PER_HOUR = Math.floor(FREE_PLAN_REQUESTS_PER_HOUR * 0.6);
const HOUR_MS = 60 * 60_000;

export type Endpoint = 'running' | 'upcoming' | 'past';

interface EndpointSpec {
  query: Record<string, string>;
  /** How long a successful response is reused before re-fetching. */
  ttlMs: number;
  /** Running matches are the live data; failing them makes the whole poll fail (=> stale). */
  critical: boolean;
}

export const ENDPOINTS: Record<Endpoint, EndpointSpec> = {
  running: { query: { 'page[size]': '50' }, ttlMs: 0, critical: true },
  upcoming: { query: { 'page[size]': '20', sort: 'scheduled_at' }, ttlMs: 5 * 60_000, critical: false },
  past: { query: { 'page[size]': '15', sort: '-scheduled_at' }, ttlMs: 5 * 60_000, critical: false },
};

interface CacheEntry {
  matches: Match[];
  fetchedAt: number;
}

export interface PandaScoreSourceOptions {
  token: string;
  logger: Logger;
  fetch?: typeof fetch;
  now?: Clock;
  baseUrl?: string;
  budget?: RequestBudget;
  backoff?: Backoff;
  requestTimeoutMs?: number;
}

export class PandaScoreSource implements MatchSource {
  readonly kind = 'pandascore' as const;

  private readonly token: string;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly now: Clock;
  private readonly baseUrl: string;
  private readonly budget: RequestBudget;
  private readonly backoff: Backoff;
  private readonly timeoutMs: number;
  private readonly cache = new Map<Endpoint, CacheEntry>();
  private retryAt = 0;

  constructor(opts: PandaScoreSourceOptions) {
    if (!opts.token) throw new Error('PandaScoreSource requires a token');
    this.token = opts.token;
    this.logger = opts.logger;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = opts.now ?? Date.now;
    this.baseUrl = opts.baseUrl ?? PANDASCORE_BASE_URL;
    this.budget = opts.budget ?? new RequestBudget(SAFE_REQUESTS_PER_HOUR, HOUR_MS, this.now);
    this.backoff = opts.backoff ?? new Backoff({ baseMs: 30_000, maxMs: 15 * 60_000 });
    this.timeoutMs = opts.requestTimeoutMs ?? 10_000;
  }

  /** URL for an endpoint. Contains no credentials, so it is safe to log. */
  urlFor(endpoint: Endpoint): string {
    const url = new URL(`/csgo/matches/${endpoint}`, this.baseUrl);
    url.searchParams.set('filter[videogame_title]', 'cs-2');
    for (const [k, v] of Object.entries(ENDPOINTS[endpoint].query)) url.searchParams.set(k, v);
    return url.toString();
  }

  async fetchMatches(): Promise<Match[]> {
    const order: Endpoint[] = ['running', 'upcoming', 'past'];
    const results = await Promise.all(order.map((e) => this.load(e)));
    // A match can briefly appear in two lists while it transitions; earlier list wins.
    const byId = new Map<string, Match>();
    for (const list of results) for (const m of list) if (!byId.has(m.id)) byId.set(m.id, m);
    return [...byId.values()];
  }

  /** Cached fetch of one endpoint. Non-critical endpoints fall back to their last good data. */
  private async load(endpoint: Endpoint): Promise<Match[]> {
    const spec = ENDPOINTS[endpoint];
    const cached = this.cache.get(endpoint);
    if (cached && spec.ttlMs > 0 && this.now() - cached.fetchedAt < spec.ttlMs) return cached.matches;
    try {
      const matches = await this.request(endpoint);
      this.cache.set(endpoint, { matches, fetchedAt: this.now() });
      return matches;
    } catch (err) {
      if (!spec.critical && cached && !(err instanceof SourceError && err.code === 'AUTH')) {
        this.logger.warn(`PandaScore ${endpoint} failed; reusing cached data`, err);
        return cached.matches;
      }
      throw err;
    }
  }

  private async request(endpoint: Endpoint): Promise<Match[]> {
    const now = this.now();
    if (now < this.retryAt) {
      throw new SourceError('Backing off after upstream errors', 'BACKING_OFF', this.retryAt - now);
    }
    if (!this.budget.tryAcquire()) {
      throw new SourceError('Local request budget exhausted', 'RATE_LIMITED', this.budget.msUntilAvailable());
    }

    const url = this.urlFor(endpoint);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.scheduleRetry(null);
      // Don't forward the raw error object: some fetch errors echo request details.
      const reason = err instanceof Error ? err.name : 'unknown';
      throw new SourceError(`Network error calling PandaScore ${endpoint} (${reason})`, 'NETWORK');
    }

    const remaining = Number(res.headers.get('x-rate-limit-remaining'));
    if (res.headers.has('x-rate-limit-remaining')) {
      // If the provider says we're nearly out, stop for 10 minutes.
      this.budget.observeUpstreamRemaining(remaining, 50, 10 * 60_000);
    }

    if (res.status === 401 || res.status === 403) {
      throw new SourceError(`PandaScore rejected the token (HTTP ${res.status})`, 'AUTH');
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = this.scheduleRetry(parseRetryAfter(res.headers.get('retry-after'), this.now()));
      const code = res.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM';
      throw new SourceError(`PandaScore ${endpoint} returned HTTP ${res.status}`, code, wait);
    }
    if (!res.ok) {
      throw new SourceError(`PandaScore ${endpoint} returned HTTP ${res.status}`, 'UPSTREAM');
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new SourceError(`PandaScore ${endpoint} returned invalid JSON`, 'INVALID_RESPONSE');
    }
    let result;
    try {
      result = mapPandaScoreResponse(body);
    } catch {
      throw new SourceError(`PandaScore ${endpoint} returned an unexpected shape`, 'INVALID_RESPONSE');
    }
    if (result.skipped > 0) {
      this.logger.warn(`PandaScore ${endpoint}: skipped ${result.skipped} unusable match(es)`);
    }
    this.backoff.reset();
    this.retryAt = 0;
    return result.matches;
  }

  private scheduleRetry(retryAfterMs: number | null): number {
    const wait = Math.max(this.backoff.next(), retryAfterMs ?? 0);
    this.retryAt = this.now() + wait;
    return wait;
  }

  /** Exposed for diagnostics (/health) — contains no secrets. */
  stats(): { budgetRemaining: number; backingOffMs: number } {
    return { budgetRemaining: this.budget.remaining(), backingOffMs: Math.max(0, this.retryAt - this.now()) };
  }
}
