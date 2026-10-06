import type { ConnectionStatus } from '../hooks/useLiveMatches';
import { formatAgo } from '../lib/format';
import type { LiveState } from '../lib/matchState';

interface NoticesProps {
  state: LiveState;
  status: ConnectionStatus;
  wakingUp: boolean;
  now: number;
}

/** Contextual banners: waking server, lost connection, stale upstream data, server messages. */
export function Notices({ state, status, wakingUp, now }: NoticesProps) {
  const notices: Array<{ key: string; tone: 'info' | 'warn' | 'error'; text: string }> = [];

  if (wakingUp && !state.hasSnapshot && status !== 'live') {
    notices.push({
      key: 'waking',
      tone: 'info',
      text: 'The server is waking up. Free hosting sleeps when idle, so the first connection can take up to a minute.',
    });
  }
  if (state.hasSnapshot && (status === 'reconnecting' || status === 'offline')) {
    notices.push({
      key: 'conn',
      tone: 'error',
      text:
        status === 'offline'
          ? 'You’re offline. Showing the last data received; it will refresh when the connection returns.'
          : 'Connection lost — reconnecting. Showing the last data received.',
    });
  }
  if (state.stale) {
    const ago = formatAgo(state.lastUpdated, now);
    notices.push({
      key: 'stale',
      tone: 'warn',
      text: `Data may be out of date: the match data provider is temporarily unavailable.${ago ? ` Last updated ${ago}.` : ''}`,
    });
  }
  if (state.statusMessage && !state.stale) {
    notices.push({ key: 'status', tone: 'info', text: state.statusMessage });
  }
  if (state.serverError) {
    notices.push({ key: 'server-error', tone: 'error', text: state.serverError });
  }

  if (notices.length === 0) return null;
  return (
    <div className="notices">
      {notices.map((n) => (
        <p key={n.key} className={`notice notice--${n.tone}`} role="status" data-testid={`notice-${n.key}`}>
          {n.text}
        </p>
      ))}
    </div>
  );
}
