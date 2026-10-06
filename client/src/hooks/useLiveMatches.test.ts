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
