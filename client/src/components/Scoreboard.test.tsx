import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { applyServerMessage, initialLiveState } from '../lib/matchState';
import { FakeWebSocket, createFakeSocket, makeMatch, snapshot } from '../test/fakes';
import { Scoreboard } from './Scoreboard';

const NOW = Date.parse('2026-10-06T15:00:00Z');

const matches = [
  makeMatch({
    id: 'done',
    status: 'finished',
    winnerId: 'a',
    endAt: '2026-10-06T13:00:00Z',
    teams: [
      { id: 'a', name: 'Winners', acronym: null, logoUrl: null, score: 2 },
      { id: 'b', name: 'Losers', acronym: null, logoUrl: null, score: 1 },
    ],
  }),
  makeMatch({ id: 'soon', status: 'upcoming', scheduledAt: '2026-10-06T15:30:00Z', gameNumber: null }),
  makeMatch({
    id: 'live',
    status: 'running',
    teams: [
      { id: 'x', name: 'Xenon', acronym: null, logoUrl: 'https://cdn.example.com/x.png', score: 1 },
      { id: 'y', name: 'Yonder', acronym: null, logoUrl: null, score: 0 },
    ],
  }),
];

const stateWith = (ms = matches, extra = {}) => ({
  ...applyServerMessage(initialLiveState, snapshot(ms)),
  ...extra,
});

describe('Scoreboard', () => {
  it('renders running first, then upcoming, then recent results', () => {
    render(<Scoreboard state={stateWith()} status="live" now={NOW} onRetry={() => {}} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Live now (1)', 'Upcoming (1)', 'Recent results (1)']);
    const cards = screen.getAllByTestId('match');
    expect(cards.map((c) => c.className)).toEqual([
      expect.stringContaining('match--running'),
      expect.stringContaining('match--upcoming'),
      expect.stringContaining('match--finished'),
    ]);
  });

  it('shows teams, scores, best-of, tournament and countdown', () => {
    render(<Scoreboard state={stateWith()} status="live" now={NOW} onRetry={() => {}} />);
    const live = screen.getByRole('article', { name: 'Xenon 1, Yonder 0' });
    expect(within(live).getByText('Xenon')).toBeInTheDocument();
    expect(within(live).getAllByTestId('score').map((s) => s.textContent)).toEqual(['1', '0']);
    expect(within(live).getByText(/Map 2 · Mirage/)).toBeInTheDocument();
    expect(within(live).getByText('Best of 3')).toBeInTheDocument();
    expect(within(live).getByText('Test Cup · Playoffs')).toBeInTheDocument();

    const upcoming = screen.getByRole('article', { name: 'Alpha Squad versus Bravo Five' });
    expect(within(upcoming).getByText('in 30m 00s')).toBeInTheDocument();
    expect(within(upcoming).queryByTestId('score')).toBeNull();

    const done = screen.getByRole('article', { name: 'Winners 2, Losers 1' });
    expect(within(done).getByText('(winner)', { exact: false })).toBeInTheDocument();
  });

  it('falls back to initials when a logo is missing or fails to load', () => {
    render(<Scoreboard state={stateWith()} status="live" now={NOW} onRetry={() => {}} />);
    const live = screen.getByRole('article', { name: 'Xenon 1, Yonder 0' });
    const img = live.querySelector('img')!;
    expect(img).toHaveAttribute('alt', '');
    expect(within(live).getAllByTestId('logo-fallback')).toHaveLength(1);
    fireEvent.error(img);
    expect(within(live).getAllByTestId('logo-fallback').map((f) => f.textContent)).toEqual(['XE', 'YO']);
  });

  it('shows a skeleton while loading, an empty state, and an error state when offline', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<Scoreboard state={initialLiveState} status="connecting" now={NOW} onRetry={onRetry} />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(screen.getByText('Loading matches…')).toBeInTheDocument();

    rerender(<Scoreboard state={stateWith([])} status="live" now={NOW} onRetry={onRetry} />);
    expect(screen.getByTestId('empty')).toHaveTextContent('No CS2 matches right now');

    rerender(<Scoreboard state={initialLiveState} status="offline" now={NOW} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach the live server');
    await userEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('App (scoreboard over a WebSocket)', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    FakeWebSocket.reset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderApp = () => render(<App url="ws://test/ws" createSocket={createFakeSocket} random={() => 1} />);

  it('renders valid logo and stream links, and drops non-http(s) ones instead of rendering them', () => {
    renderApp();
    const good = makeMatch({
      id: 'good',
      streamUrl: 'https://kick.com/good',
      teams: [
        { id: 'g1', name: 'Good One', acronym: null, logoUrl: 'https://cdn.example.com/g1.png', score: 0 },
        { id: 'g2', name: 'Good Two', acronym: null, logoUrl: null, score: 0 },
      ],
    });
    const bad = {
      ...makeMatch({ id: 'bad' }),
      streamUrl: 'javascript:alert(1)',
      teams: [
        { id: 'b1', name: 'Bad One', acronym: null, logoUrl: 'javascript:alert(2)', score: 0 },
        { id: 'b2', name: 'Bad Two', acronym: null, logoUrl: 'data:image/png;base64,AA', score: 0 },
      ],
    };
    act(() => {
      FakeWebSocket.latest().open();
      FakeWebSocket.latest().receive(snapshot([good, bad as never]));
    });

    const goodCard = screen.getByRole('article', { name: /Good One/ });
    expect(goodCard.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/g1.png');
    expect(within(goodCard).getByRole('link', { name: /Watch stream/ })).toHaveAttribute('href', 'https://kick.com/good');

    const badCard = screen.getByRole('article', { name: /Bad One/ }); // the match itself is still shown
    expect(badCard.querySelector('img')).toBeNull();
    expect(within(badCard).getAllByTestId('logo-fallback')).toHaveLength(2);
    expect(within(badCard).queryByRole('link')).toBeNull();
    expect(document.body.innerHTML).not.toContain('javascript:');
  });

  it('shows the DEMO DATA badge for fixture data and LIVE DATA for PandaScore', () => {
    renderApp();
    act(() => {
      FakeWebSocket.latest().open();
      FakeWebSocket.latest().receive(snapshot(matches));
    });
    expect(screen.getByTestId('source-badge')).toHaveTextContent('DEMO DATA');
    expect(screen.getByTestId('connection-status')).toHaveTextContent('Live');

    act(() =>
      FakeWebSocket.latest().receive(
        snapshot(matches.map((m) => ({ ...m, source: 'pandascore' as const })), { source: 'pandascore' }),
      ),
    );
    expect(screen.getByTestId('source-badge')).toHaveTextContent('LIVE DATA via PandaScore');
  });

  it('shows a stale notice when the server reports stale data', () => {
    renderApp();
    act(() => {
      FakeWebSocket.latest().open();
      FakeWebSocket.latest().receive(snapshot(matches));
      FakeWebSocket.latest().receive({
        type: 'status',
        v: 1,
        source: 'pandascore',
        stale: true,
        lastUpdated: '2026-10-06T15:00:00Z',
        message: 'upstream down',
      });
    });
    expect(screen.getByTestId('notice-stale')).toHaveTextContent('Data may be out of date');
  });

  it('updates scores without a refresh and announces them in an aria-live region', () => {
    renderApp();
    act(() => {
      FakeWebSocket.latest().open();
      FakeWebSocket.latest().receive(snapshot(matches));
    });
    const region = screen.getByTestId('live-region');
    expect(region).toHaveAttribute('aria-live', 'polite');

    const live = matches[2]!;
    const scored = { ...live, teams: [{ ...live.teams[0], score: 2 }, live.teams[1]] as typeof live.teams };
    act(() =>
      FakeWebSocket.latest().receive({ type: 'diff', v: 1, serverTime: 'T', upserted: [scored], removed: [] }),
    );
    expect(screen.getByRole('article', { name: 'Xenon 2, Yonder 0' })).toBeInTheDocument();
    expect(region).toHaveTextContent('Score update: Xenon 2–0 Yonder');
  });

  it('shows reconnecting with the last data when the connection drops', () => {
    renderApp();
    act(() => {
      FakeWebSocket.latest().open();
      FakeWebSocket.latest().receive(snapshot(matches));
      FakeWebSocket.latest().drop();
    });
    expect(screen.getByTestId('connection-status')).toHaveTextContent('Reconnecting');
    expect(screen.getByTestId('notice-conn')).toHaveTextContent('reconnecting');
    expect(screen.getAllByTestId('match')).toHaveLength(3);
  });

  it('has a keyboard-reachable skip link and landmarks', async () => {
    renderApp();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Skip to matches' })).toHaveFocus();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
