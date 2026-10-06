import type { Match, Source } from '@esports-live/shared';

/** Adapter boundary: every data provider normalizes into the shared `Match` model. */
export interface MatchSource {
  readonly kind: Source;
  /** Fetch the current set of running, upcoming and recently finished matches. */
  fetchMatches(): Promise<Match[]>;
}

export type SourceErrorCode = 'AUTH' | 'RATE_LIMITED' | 'UPSTREAM' | 'NETWORK' | 'INVALID_RESPONSE' | 'BACKING_OFF';

/** Errors thrown by sources. Messages must never contain secrets. */
export class SourceError extends Error {
  constructor(
    message: string,
    readonly code: SourceErrorCode,
    /** Hint for the poller: don't try again before this many ms. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}
