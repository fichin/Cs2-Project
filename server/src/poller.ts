import type { DiffMessage } from '@esports-live/shared';
import { PROTOCOL_VERSION } from '@esports-live/shared';
import { isEmptyDiff } from './diff.js';
import type { Logger } from './logger.js';
import { Backoff } from './rateLimit.js';
import { type MatchSource, SourceError } from './sources/MatchSource.js';
import type { MatchStore } from './store.js';

export interface PollerEvents {
  /** Matches changed since the last poll. */
  onDiff(message: DiffMessage): void;
  /** Freshness/source status changed (e.g. went stale or recovered). */
  onStatus(): void;
  /** The source was replaced (e.g. fallback to fixtures) — clients need a fresh snapshot. */
  onReset(): void;
}

export interface PollerOptions {
  source: MatchSource;
  store: MatchStore;
  intervalMs: number;
  logger: Logger;
  events: PollerEvents;
  /** Called when the source rejects its credentials; returns a replacement source. */
  fallback?: () => { source: MatchSource; intervalMs: number };
  backoff?: Backoff;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Poll -> normalize (done by the source) -> diff against the previous state -> broadcast the
 * changes. On failure the last good state is kept and flagged `stale`; retries back off
 * exponentially but never run faster than the configured interval.
 */
export class Poller {
  private source: MatchSource;
  private intervalMs: number;
  private timer: unknown = null;
  private running = false;
  private inFlight: Promise<void> | null = null;
  private readonly backoff: Backoff;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly opts: PollerOptions) {
    this.source = opts.source;
    this.intervalMs = opts.intervalMs;
    this.backoff = opts.backoff ?? new Backoff({ baseMs: opts.intervalMs, maxMs: 10 * 60_000 });
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as NodeJS.Timeout));
  }

  get currentSource(): MatchSource {
    return this.source;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    await this.inFlight;
  }

  private tick(): void {
    this.inFlight = this.pollOnce().then((delay) => {
      this.inFlight = null;
      if (this.running) this.timer = this.setTimer(() => this.tick(), delay);
    });
  }

  /** Run one poll cycle. Returns the delay before the next one. Never throws. */
  async pollOnce(): Promise<number> {
    const { store, logger, events } = this.opts;
    try {
      const matches = await this.source.fetchMatches();
      const diff = store.apply(matches);
      this.backoff.reset();
      if (!isEmptyDiff(diff)) {
        events.onDiff({
          type: 'diff',
          v: PROTOCOL_VERSION,
          serverTime: new Date().toISOString(),
          upserted: diff.upserted,
          removed: diff.removed,
        });
      }
      if (store.stale) {
        store.stale = false;
        store.statusMessage = null;
        logger.info(`Data source ${this.source.kind} recovered`);
        events.onStatus();
      }
      return this.intervalMs;
    } catch (err) {
      if (err instanceof SourceError && err.code === 'AUTH' && this.opts.fallback) {
        const next = this.opts.fallback();
        logger.warn(`${err.message}. Falling back to ${next.source.kind} data.`);
        this.source = next.source;
        this.intervalMs = next.intervalMs;
        this.backoff.reset();
        store.reset(next.source.kind);
        store.statusMessage = 'Live data unavailable (token rejected); showing demo data';
        events.onReset();
        return 0;
      }

      const wait = Math.max(this.intervalMs, this.backoff.next(), err instanceof SourceError ? (err.retryAfterMs ?? 0) : 0);
      logger.warn(`Poll failed; serving last good state as stale. Next attempt in ${Math.round(wait / 1000)}s`, err);
      const message = 'Live data source is temporarily unavailable; showing the last known results';
      if (!store.stale || store.statusMessage !== message) {
        store.stale = true;
        store.statusMessage = message;
        events.onStatus();
      }
      return wait;
    }
  }
}
