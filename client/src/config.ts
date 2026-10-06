/** WebSocket URL of the server. Set VITE_WS_URL for deployments; defaults to the local dev server. */
export function resolveWsUrl(env: Record<string, string | undefined> = import.meta.env): string {
  const configured = env.VITE_WS_URL?.trim();
  if (configured) return configured;
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const scheme = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${host}:3001/ws`;
}
