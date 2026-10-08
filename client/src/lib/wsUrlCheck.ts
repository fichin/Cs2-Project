export interface WsUrlCheck {
  level: 'ok' | 'warn' | 'error';
  message: string;
}

const HINT = 'Set VITE_WS_URL to the server, e.g. wss://<your-server>/ws (see client/.env.example).';

/**
 * Build-time check of the WebSocket URL the client will connect to. Without VITE_WS_URL a production
 * bundle falls back to <page host>:3001, which is never right on a static host. That's an error on a
 * deploy host (the build fails) and a loud warning elsewhere, so CI and local builds keep working.
 */
export function checkWsUrl(env: Record<string, string | undefined>): WsUrlCheck {
  const url = env.VITE_WS_URL?.trim();
  const onDeployHost = Boolean(env.VERCEL || env.NETLIFY);

  if (!url) {
    return {
      level: onDeployHost ? 'error' : 'warn',
      message: `VITE_WS_URL is not set: the production client would connect to <page host>:3001. ${HINT}`,
    };
  }
  if (!/^wss?:\/\//.test(url)) {
    return { level: 'error', message: `VITE_WS_URL must start with ws:// or wss:// (got "${url}"). ${HINT}` };
  }
  if (url.startsWith('ws://') && onDeployHost) {
    return {
      level: 'error',
      message: 'VITE_WS_URL uses ws:// but the site is served over https, so browsers will block it. Use wss://.',
    };
  }
  return { level: 'ok', message: `WebSocket URL: ${url}` };
}
