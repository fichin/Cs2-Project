import { parseServerMessage } from '@esports-live/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_RECONNECT, type ReconnectBackoffOptions, reconnectDelay } from '../lib/backoff';
import { type LiveState, applyServerMessage, describeChanges, initialLiveState } from '../lib/matchState';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface UseLiveMatchesOptions {
  url: string;
  /** Injected in tests; defaults to the browser's native WebSocket. */
  createSocket?: (url: string) => WebSocket;
  backoff?: ReconnectBackoffOptions;
  random?: () => number;
  /** Show the "server is waking up" hint if the first connection takes longer than this. */
  wakeUpAfterMs?: number;
  /** After this many consecutive failed attempts, report `offline` (we still keep retrying). */
  offlineAfterAttempts?: number;
}

export interface LiveMatches {
  status: ConnectionStatus;
  /** First connection is slow — likely a sleeping free-tier server spinning up. */
  wakingUp: boolean;
  state: LiveState;
  /** Latest screen-reader announcement (score changes etc.). */
  announcement: string;
  /** Epoch ms of the next scheduled reconnect attempt, if any. */
  retryAt: number | null;
  retryNow: () => void;
}

export function useLiveMatches(options: UseLiveMatchesOptions): LiveMatches {
  const [state, setState] = useState<LiveState>(initialLiveState);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [wakingUp, setWakingUp] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const optionsRef = useRef(options);
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    optionsRef.current = options;
  });

  const { url } = options;

  useEffect(() => {
    const {
      createSocket = (u: string) => new WebSocket(u),
      backoff = DEFAULT_RECONNECT,
      random = Math.random,
      wakeUpAfterMs = 4_000,
      offlineAfterAttempts = 8,
    } = optionsRef.current;

    let disposed = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let everConnected = false;
    let live: LiveState = initialLiveState;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

    const wakeTimer = setTimeout(() => {
      if (!everConnected && !disposed) setWakingUp(true);
    }, wakeUpAfterMs);

    const scheduleReconnect = () => {
      if (disposed) return;
      if (browserOffline()) {
        setStatus('offline'); // the `online` listener reconnects
        setRetryAt(null);
        return;
      }
      const delay = reconnectDelay(attempt, backoff, random);
      attempt += 1;
      setStatus(attempt > offlineAfterAttempts ? 'offline' : 'reconnecting');
      setRetryAt(Date.now() + delay);
      reconnectTimer = setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      setRetryAt(null);
      if (!everConnected && attempt === 0) setStatus('connecting');

      let ws: WebSocket;
      try {
        ws = createSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socket = ws;

      ws.onopen = () => {
        if (socket !== ws) return;
        attempt = 0;
        everConnected = true;
        clearTimeout(wakeTimer);
        setWakingUp(false);
        setStatus('live');
      };

      ws.onmessage = (event: MessageEvent) => {
        if (socket !== ws) return;
        const parsed = parseServerMessage(event.data);
        if (!parsed.ok) return; // ignore malformed frames rather than corrupting state
        const msg = parsed.message;
        if (msg.type === 'diff' && live.hasSnapshot) {
          const lines = describeChanges(live.matches, msg.upserted);
          if (lines.length > 0) setAnnouncement(lines.join('. '));
        }
        live = applyServerMessage(live, msg);
        setState(live);
      };

      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        scheduleReconnect();
      };
      // `close` always follows `error`; reconnect logic lives there.
      ws.onerror = () => {};
    }

    const onOnline = () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        setStatus('live');
        return;
      }
      attempt = 0;
      if (!socket) connect();
    };
    const onOffline = () => setStatus('offline');

    retryRef.current = () => {
      if (socket) return;
      attempt = 0;
      connect();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(wakeTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close(1000, 'unmount');
        socket = null;
      }
    };
  }, [url]);

  const retryNow = useCallback(() => retryRef.current(), []);

  return { status, wakingUp, state, announcement, retryAt, retryNow };
}
