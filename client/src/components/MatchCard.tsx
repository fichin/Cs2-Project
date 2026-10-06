import type { Match, Team } from '@esports-live/shared';
import { memo } from 'react';
import { formatAgo, formatCountdown, formatLocalTime } from '../lib/format';
import { TeamLogo } from './TeamLogo';

interface MatchCardProps {
  match: Match;
  now: number;
}

function StatusPill({ match, now }: MatchCardProps) {
  if (match.status === 'running') {
    const game = match.gameNumber ? `Map ${match.gameNumber}${match.mapName ? ` · ${match.mapName}` : ''}` : null;
    return (
      <span className="pill pill--live">
        <span className="pill__dot" aria-hidden="true" />
        Live{game ? <span className="pill__detail"> · {game}</span> : null}
      </span>
    );
  }
  if (match.status === 'upcoming') {
    return <span className="pill pill--upcoming">{formatCountdown(match.scheduledAt, now)}</span>;
  }
  const ago = formatAgo(match.endAt ?? match.beginAt ?? match.scheduledAt, now);
  return (
    <span className="pill pill--final">
      Final{ago ? <span className="pill__detail"> · {ago}</span> : null}
    </span>
  );
}

function TeamRow({ team, match }: { team: Team; match: Match }) {
  const isWinner = match.status === 'finished' && match.winnerId === team.id;
  const isLoser = match.status === 'finished' && match.winnerId !== null && !isWinner;
  const showScore = match.status !== 'upcoming';
  return (
    <li className={`team${isWinner ? ' team--winner' : ''}${isLoser ? ' team--loser' : ''}`}>
      <TeamLogo name={team.name} url={team.logoUrl} />
      <span className="team__name" title={team.name}>
        {team.name}
        {isWinner ? <span className="visually-hidden"> (winner)</span> : null}
      </span>
      {showScore ? (
        // Keyed by score so a change re-mounts the element and replays the highlight animation.
        <span key={team.score} className="team__score" data-testid="score">
          {team.score}
        </span>
      ) : null}
    </li>
  );
}

function MatchCardImpl({ match, now }: MatchCardProps) {
  const [a, b] = match.teams;
  const when = match.status === 'finished' ? (match.endAt ?? match.scheduledAt) : (match.scheduledAt ?? match.beginAt);
  const local = formatLocalTime(when);
  const label =
    match.status === 'upcoming'
      ? `${a.name} versus ${b.name}`
      : `${a.name} ${a.score}, ${b.name} ${b.score}`;

  return (
    <article className={`match match--${match.status}`} aria-label={label} data-testid="match">
      <header className="match__header">
        <p className="match__event">
          {match.league ? <span className="match__league">{match.league}</span> : null}
          <span className="match__tournament">{match.tournament}</span>
        </p>
        <StatusPill match={match} now={now} />
      </header>

      <ul className="match__teams">
        <TeamRow team={a} match={match} />
        <TeamRow team={b} match={match} />
      </ul>

      <footer className="match__footer">
        {match.bestOf ? <span>Best of {match.bestOf}</span> : <span>Format TBA</span>}
        {local && when ? <time dateTime={when}>{local}</time> : null}
        {match.streamUrl ? (
          <a href={match.streamUrl} target="_blank" rel="noopener noreferrer" className="match__stream">
            Watch stream<span className="visually-hidden"> for {a.name} versus {b.name} (opens in new tab)</span>
          </a>
        ) : null}
      </footer>
    </article>
  );
}

export const MatchCard = memo(MatchCardImpl);
