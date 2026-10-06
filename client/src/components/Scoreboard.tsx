import type { Match } from '@esports-live/shared';
import { useMemo } from 'react';
import type { ConnectionStatus } from '../hooks/useLiveMatches';
import { type LiveState, groupMatches } from '../lib/matchState';
import { MatchCard } from './MatchCard';

interface ScoreboardProps {
  state: LiveState;
  status: ConnectionStatus;
  now: number;
  onRetry: () => void;
}

function Section({ id, title, matches, now }: { id: string; title: string; matches: Match[]; now: number }) {
  if (matches.length === 0) return null;
  return (
    <section className="board-section" aria-labelledby={id}>
      <h2 id={id} className="board-section__title">
        {title} <span className="count">({matches.length})</span>
      </h2>
      <ul className="match-grid" role="list">
        {matches.map((m) => (
          <li key={m.id}>
            <MatchCard match={m} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SkeletonBoard() {
  return (
    <div className="skeleton-board" data-testid="skeleton">
      <p className="visually-hidden" role="status">
        Loading matches…
      </p>
      <div className="match-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="match match--skeleton">
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--row" />
            <div className="skeleton skeleton--row" />
            <div className="skeleton skeleton--line skeleton--short" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Scoreboard({ state, status, now, onRetry }: ScoreboardProps) {
  const groups = useMemo(() => groupMatches(Object.values(state.matches)), [state.matches]);

  if (!state.hasSnapshot) {
    if (status === 'offline') {
      return (
        <div className="state-panel state-panel--error" role="alert">
          <h2>Can’t reach the live server</h2>
          <p>We’ll keep trying automatically. Check your connection, or try again now.</p>
          <button type="button" className="button" onClick={onRetry}>
            Retry now
          </button>
        </div>
      );
    }
    return <SkeletonBoard />;
  }

  const total = groups.running.length + groups.upcoming.length + groups.finished.length;
  if (total === 0) {
    return (
      <div className="state-panel" data-testid="empty">
        <h2>No CS2 matches right now</h2>
        <p>There are no live, upcoming or recent matches to show. This page updates automatically.</p>
      </div>
    );
  }

  return (
    <>
      <Section id="live-heading" title="Live now" matches={groups.running} now={now} />
      <Section id="upcoming-heading" title="Upcoming" matches={groups.upcoming} now={now} />
      <Section id="results-heading" title="Recent results" matches={groups.finished} now={now} />
    </>
  );
}
