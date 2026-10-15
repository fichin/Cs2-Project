import type { Logger } from './logger.js';

/**
 * Warn at most once per `intervalMs` for each key, and report how many similar events were
 * suppressed in between, so a flood of rejected requests can't fill the logs.
 */
export function createThrottledWarn(
  logger: Logger,
  intervalMs = 60_000,
  now: () => number = Date.now,
): (key: string, message: string) => void {
  const state = new Map<string, { last: number; suppressed: number }>();
  return (key, message) => {
    const t = now();
    const entry = state.get(key);
    if (entry && t - entry.last < intervalMs) {
      entry.suppressed += 1;
      return;
    }
    const suppressed = entry?.suppressed ?? 0;
    logger.warn(suppressed > 0 ? `${message} (+${suppressed} similar since the last report)` : message);
    state.set(key, { last: t, suppressed: 0 });
  };
}
