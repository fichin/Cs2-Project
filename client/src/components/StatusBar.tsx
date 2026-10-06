import type { Source } from '@esports-live/shared';
import type { ConnectionStatus } from '../hooks/useLiveMatches';

export function SourceBadge({ source }: { source: Source | null }) {
  if (!source) return null;
  return source === 'pandascore' ? (
    <span className="badge badge--live" data-testid="source-badge">
      LIVE DATA via PandaScore
    </span>
  ) : (
    <span className="badge badge--demo" data-testid="source-badge" title="Generated demo data — not real matches">
      DEMO DATA
    </span>
  );
}

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

export function ConnectionIndicator({
  status,
  retryAt,
  now,
}: {
  status: ConnectionStatus;
  retryAt: number | null;
  now: number;
}) {
  const secs = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;
  return (
    <span className={`conn conn--${status}`} role="status" data-testid="connection-status">
      <span className="conn__dot" aria-hidden="true" />
      <span>
        {LABELS[status]}
        {status !== 'live' && secs !== null && secs > 0 ? <span className="conn__retry"> retry in {secs}s</span> : null}
      </span>
    </span>
  );
}
