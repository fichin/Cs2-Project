export type Clock = () => number;

/**
 * Sliding-window request budget. PandaScore's free plan allows 1,000 requests/hour; we
 * budget well below that so restarts, retries and manual testing never push us over.
 */
export class RequestBudget {
  private readonly stamps: number[] = [];
  private pausedUntil = 0;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: Clock = Date.now,
  ) {}

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.stamps.length > 0 && (this.stamps[0] ?? 0) <= cutoff) this.stamps.shift();
  }

  remaining(): number {
    this.prune();
    return Math.max(0, this.limit - this.stamps.length);
  }

  /** Reserve one request. Returns false when the budget is exhausted or paused. */
  tryAcquire(): boolean {
    if (this.now() < this.pausedUntil) return false;
    if (this.remaining() <= 0) return false;
    this.stamps.push(this.now());
    return true;
  }

  /** Milliseconds until the next request would be allowed (0 if available now). */
  msUntilAvailable(): number {
    const now = this.now();
    const pause = Math.max(0, this.pausedUntil - now);
    if (this.remaining() > 0) return pause;
    const oldest = this.stamps[0] ?? now;
    return Math.max(pause, oldest + this.windowMs - now);
  }

  /**
   * Feed back the upstream `X-Rate-Limit-Remaining` header. If the provider says we are nearly
   * out (e.g. the same token is used elsewhere), pause instead of burning the last requests.
   */
  observeUpstreamRemaining(remaining: number, reserve: number, pauseMs: number): void {
    if (Number.isFinite(remaining) && remaining <= reserve) {
      this.pausedUntil = Math.max(this.pausedUntil, this.now() + pauseMs);
    }
  }
}

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  factor?: number;
  /** Returns a number in [0, 1). Injected for deterministic tests. */
  random?: () => number;
}

/** Exponential backoff with "equal jitter": delay is in [d/2, d] where d = base * factor^n (capped). */
export class Backoff {
  private failures = 0;
  private readonly factor: number;
  private readonly random: () => number;

  constructor(private readonly opts: BackoffOptions) {
    this.factor = opts.factor ?? 2;
    this.random = opts.random ?? Math.random;
  }

  get attempts(): number {
    return this.failures;
  }

  /** Record a failure and return how long to wait before trying again. */
  next(): number {
    const exp = Math.min(this.opts.maxMs, this.opts.baseMs * this.factor ** this.failures);
    this.failures += 1;
    return Math.round(exp / 2 + (this.random() * exp) / 2);
  }

  reset(): void {
    this.failures = 0;
  }
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds from now. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}
