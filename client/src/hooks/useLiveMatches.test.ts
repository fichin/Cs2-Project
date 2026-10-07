import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket, createFakeSocket, makeMatch, snapshot } from '../test/fakes';
import { useLiveMatches } from './useLiveMatches';

const URL = 'ws://test/ws';
const opts = {
  url: URL,
  createSocket: createFakeSocket,
  backoff: { baseMs: 1000, maxMs: 8000 },
  random: () => 1, // max jitter => deterministic delays: 1s, 2s, 4s, 8s...
  wakeUpAfterMs: 4000,
  offlineAfterAttempts: 3,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket);
  FakeWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useLiveMatches', () => {
  it('connects, goes live on open and applies snapshot + diff', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    expect(result.current.status).toBe('connecting');
    expect(FakeWebSocket.instances).toHaveLength(1);

    const ws = FakeWebSocket.latest();
    act(() => ws.open());
    expect(result.current.status).toBe('live');

    const m = makeMatch({ id: 'a' });
    act(() => ws.receive(snapshot([m])));
    expect(result.current.state.hasSnapshot).toBe(true);
    expect(result.current.state.matches.a).toEqual(m);

    const scored = { ...m, teams: [{ ...m.teams[0], score: 2 }, m.teams[1]] as typeof m.teams };
    act(() => ws.receive({ type: 'diff', v: 1, serverTime: 'T', upserted: [scored], removed: [] }));
    expect(result.current.state.matches.a!.teams[0].score).toBe(2);
    expect(result.current.announcement).toBe('Score update: Alpha Squad 2–0 Bravo Five');
  });

  it('ignores malformed frames', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    const ws = FakeWebSocket.latest();
    act(() => {
      ws.open();
      ws.receive('not json');
      ws.receive({ type: 'snapshot', v: 99 });
    });
    expect(result.current.state.hasSnapshot).toBe(false);
    expect(result.current.status).toBe('live');
  });

  it('reconnects with exponential backoff and keeps the last data', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    act(() => {
      FakeWebSocket.latest().open();
      FakeWebSocket.latest().receive(snapshot([makeMatch({ id: 'a' })]));
    });

    act(() => FakeWebSocket.latest().drop());
    expect(result.current.status).toBe('reconnecting');
    expect(result.current.state.matches.a).toBeDefined(); // last data kept
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(999));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2); // retried after 1s

    act(() => FakeWebSocket.latest().drop());
    act(() => vi.advanceTimersByTime(1999));
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(3); // then after 2s

    act(() => FakeWebSocket.latest().open());
    expect(result.current.status).toBe('live');

    // backoff resets after a successful connection
    act(() => FakeWebSocket.latest().drop());
    act(() => vi.advanceTimersByTime(1000));
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('reports offline after repeated failures but keeps retrying', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    for (let i = 0; i < 4; i++) {
      act(() => FakeWebSocket.latest().drop());
      act(() => vi.advanceTimersByTime(8000));
    }
    expect(result.current.status).toBe('offline');
    const count = FakeWebSocket.instances.length;
    act(() => FakeWebSocket.latest().drop());
    act(() => vi.advanceTimersByTime(8000));
    expect(FakeWebSocket.instances.length).toBe(count + 1);
  });

  it('shows "waking up" when the first connection is slow, and clears it on open', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    expect(result.current.wakingUp).toBe(false);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.wakingUp).toBe(true);
    act(() => FakeWebSocket.latest().open());
    expect(result.current.wakingUp).toBe(false);
  });

  it('retryNow reconnects immediately', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    act(() => FakeWebSocket.latest().drop());
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => result.current.retryNow());
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('closes the socket and stops retrying on unmount', () => {
    const { unmount } = renderHook(() => useLiveMatches(opts));
    const ws = FakeWebSocket.latest();
    unmount();
    expect(ws.closedByClient).toBe(true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('useLiveMatches watchdog (dead connection detection)', () => {
  const HEARTBEAT_MS = 5_000;
  const N = HEARTBEAT_MS * 3; // watchdog threshold
  const heartbeat = { type: 'heartbeat', v: 1, serverTime: '2026-10-07T12:00:00.000Z' };

  /** Open the latest socket and deliver a snapshot announcing the heartbeat interval (null = old server). */
  function goLive(heartbeatMs: number | null = HEARTBEAT_MS, matchId = 'a') {
    const ws = FakeWebSocket.latest();
    act(() => {
      ws.open();
      ws.receive(snapshot([makeMatch({ id: matchId })], heartbeatMs === null ? {} : { heartbeatMs }));
    });
    return ws;
  }

  let visibility: DocumentVisibilityState = 'visible';
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });
  afterEach(() => vi.restoreAllMocks());

  it('(a) fires after 3 x heartbeatMs of silence: status "reconnecting" at once, then reconnects', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    const first = goLive();

    act(() => vi.advanceTimersByTime(N - 1));
    expect(result.current.status).toBe('live');
    expect(first.closedByClient).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.status).toBe('reconnecting'); // without waiting for onclose
    expect(first.closedByClient).toBe(true);
    expect(result.current.state.matches.a).toBeDefined(); // last data kept

    act(() => vi.advanceTimersByTime(1000)); // first backoff step
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('clamps a too-small heartbeatMs from the server to 5000 ms', () => {
    renderHook(() => useLiveMatches(opts));
    goLive(100);
    act(() => vi.advanceTimersByTime(N - 1));
    expect(FakeWebSocket.latest().closedByClient).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances[0]!.closedByClient).toBe(true);
  });

  it('(b) every valid message resets the timer, but garbage frames do not', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    const ws = goLive();
    const diff = { type: 'diff', v: 1, serverTime: 'T', upserted: [], removed: [] };
    const status = { type: 'status', v: 1, source: 'fixture', stale: false, lastUpdated: null, message: null };

    for (const msg of [heartbeat, diff, status, heartbeat]) {
      act(() => vi.advanceTimersByTime(N - 1000));
      act(() => ws.receive(msg));
    }
    expect(ws.closedByClient).toBe(false); // ~4N elapsed in total, never N of silence
    expect(result.current.status).toBe('live');

    act(() => vi.advanceTimersByTime(N - 1000));
    act(() => ws.receive('not json'));
    act(() => vi.advanceTimersByTime(1000));
    expect(ws.closedByClient).toBe(true);
    expect(result.current.status).toBe('reconnecting');
  });

  it('(c) never arms the watchdog when the snapshot has no heartbeatMs (old server)', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    const ws = goLive(null);
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(ws.closedByClient).toBe(false);
    expect(result.current.status).toBe('live');
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('(d) a stale socket and its old timer cannot change the new connection', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    const old = goLive(HEARTBEAT_MS, 'old');
    act(() => vi.advanceTimersByTime(N)); // watchdog fires on `old`
    act(() => vi.advanceTimersByTime(1000)); // reconnect
    const fresh = goLive(HEARTBEAT_MS, 'fresh');
    expect(result.current.status).toBe('live');

    // The dead socket wakes up and misbehaves: none of it may reach state or trigger reconnects.
    act(() => {
      old.open();
      old.receive(snapshot([makeMatch({ id: 'zombie' })], { heartbeatMs: HEARTBEAT_MS }));
      old.drop();
    });
    expect(result.current.status).toBe('live');
    expect(Object.keys(result.current.state.matches)).toEqual(['fresh']);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // Keep the fresh connection talking past the old socket's deadline: no reconnect.
    act(() => vi.advanceTimersByTime(N - 1000));
    act(() => fresh.receive(heartbeat));
    act(() => vi.advanceTimersByTime(N - 1000));
    expect(fresh.closedByClient).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('(e) on visibilitychange to visible: reconnects if silence > N, does nothing otherwise', () => {
    const { result } = renderHook(() => useLiveMatches(opts));
    const ws = goLive();
    const becomeVisible = () => {
      visibility = 'visible';
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };

    // Short absence: clock moves but no timer runs (as in a throttled background tab).
    visibility = 'hidden';
    vi.setSystemTime(Date.now() + N / 2);
    becomeVisible();
    expect(ws.closedByClient).toBe(false);
    expect(result.current.status).toBe('live');

    // Long absence (e.g. laptop sleep): reconnect immediately, before any timer fires.
    visibility = 'hidden';
    vi.setSystemTime(Date.now() + N);
    becomeVisible();
    expect(ws.closedByClient).toBe(true);
    expect(result.current.status).toBe('reconnecting');
  });

  it('(f) cleanup clears the watchdog timer and removes the visibility listener', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useLiveMatches(opts));
    goLive();
    expect(vi.getTimerCount()).toBeGreaterThan(0); // watchdog armed

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    // A visibility change after unmount must not create sockets or throw.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => vi.advanceTimersByTime(10 * N));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
