import { LiveRegion } from './components/LiveRegion';
import { Notices } from './components/Notices';
import { Scoreboard } from './components/Scoreboard';
import { ConnectionIndicator, SourceBadge } from './components/StatusBar';
import { resolveWsUrl } from './config';
import { type UseLiveMatchesOptions, useLiveMatches } from './hooks/useLiveMatches';
import { useNow } from './hooks/useNow';
import { formatAgo } from './lib/format';

type AppProps = Partial<UseLiveMatchesOptions>;

export function App(props: AppProps) {
  const live = useLiveMatches({ url: props.url ?? resolveWsUrl(), ...props });
  const now = useNow(1_000);
  const { state, status } = live;
  const updated = formatAgo(state.lastUpdated, now);

  return (
    <div className="app">
      <a className="skip-link" href="#matches">
        Skip to matches
      </a>
      <header className="site-header">
        <div className="brand">
          <h1 className="brand__title">
            esports<span className="brand__accent">-live</span>
          </h1>
          <p className="brand__subtitle">Counter-Strike 2 · live scores, schedules &amp; results</p>
        </div>
        <div className="site-header__status">
          <SourceBadge source={state.source} />
          <ConnectionIndicator status={status} retryAt={live.retryAt} now={now} />
        </div>
      </header>

      <Notices state={state} status={status} wakingUp={live.wakingUp} now={now} />

      <main id="matches" className="board" tabIndex={-1} aria-busy={!state.hasSnapshot}>
        <Scoreboard state={state} status={status} now={now} onRetry={live.retryNow} />
      </main>

      <footer className="site-footer">
        {state.source === 'pandascore' ? (
          <p>
            Match data by <a href="https://pandascore.co" target="_blank" rel="noopener noreferrer">PandaScore</a>{' '}
            (schedules &amp; results tier, refreshed about every 30&nbsp;s).
          </p>
        ) : state.source === 'fixture' ? (
          <p>Demo mode: teams and scores are generated locally and are not real matches.</p>
        ) : null}
        {updated ? <p>Last data change {updated}.</p> : null}
      </footer>

      <LiveRegion message={live.announcement} />
    </div>
  );
}
