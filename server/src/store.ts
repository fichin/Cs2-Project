import type { Match, SnapshotMessage, Source, StatusMessage } from '@esports-live/shared';
import { PROTOCOL_VERSION } from '@esports-live/shared';
import { diffMatches, type MatchDiff } from './diff.js';

/** The last known good state that is served to clients. */
export class MatchStore {
  private matches = new Map<string, Match>();
  stale = false;
  lastUpdated: string | null = null;
  statusMessage: string | null = null;

  constructor(public source: Source) {}

  /** Replace the state with a fresh poll result and return what changed. */
  apply(next: readonly Match[], at: Date = new Date()): MatchDiff {
    const diff = diffMatches(this.matches, next);
    const updated = new Map<string, Match>();
    for (const m of next) if (!updated.has(m.id)) updated.set(m.id, m);
    this.matches = updated;
    this.lastUpdated = at.toISOString();
    return diff;
  }

  /** Switch to a different source (e.g. fallback to fixtures); clears all state. */
  reset(source: Source): void {
    this.source = source;
    this.matches = new Map();
    this.stale = false;
    this.lastUpdated = null;
    this.statusMessage = null;
  }

  get size(): number {
    return this.matches.size;
  }

  snapshot(now: Date = new Date()): SnapshotMessage {
    return {
      type: 'snapshot',
      v: PROTOCOL_VERSION,
      source: this.source,
      stale: this.stale,
      lastUpdated: this.lastUpdated,
      serverTime: now.toISOString(),
      matches: [...this.matches.values()],
    };
  }

  status(): StatusMessage {
    return {
      type: 'status',
      v: PROTOCOL_VERSION,
      source: this.source,
      stale: this.stale,
      lastUpdated: this.lastUpdated,
      message: this.statusMessage,
    };
  }
}
