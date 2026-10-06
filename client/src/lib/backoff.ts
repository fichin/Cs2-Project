export interface ReconnectBackoffOptions {
  baseMs: number;
  maxMs: number;
}

export const DEFAULT_RECONNECT: ReconnectBackoffOptions = { baseMs: 500, maxMs: 15_000 };

/**
 * Delay before reconnect attempt number `attempt` (0-based): exponential growth capped at
 * `maxMs`, with "equal jitter" (half fixed, half random) so many tabs reconnecting after a
 * server restart don't stampede it at the same instant.
 */
export function reconnectDelay(
  attempt: number,
  opts: ReconnectBackoffOptions = DEFAULT_RECONNECT,
  random: () => number = Math.random,
): number {
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.max(0, attempt));
  return Math.round(exp / 2 + random() * (exp / 2));
}
