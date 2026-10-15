import { describe, expect, it } from 'vitest';
import { createThrottledWarn } from '../src/logThrottle.js';
import type { Logger } from '../src/logger.js';

function capture() {
  const lines: string[] = [];
  const logger: Logger = { info: () => {}, warn: (m) => lines.push(m), error: () => {} };
  return { lines, logger };
}

describe('createThrottledWarn', () => {
  it('logs the first event, suppresses repeats within the interval, then reports the suppressed count', () => {
    let now = 0;
    const { lines, logger } = capture();
    const warn = createThrottledWarn(logger, 60_000, () => now);

    warn('origin', 'Rejected origin A');
    for (let i = 0; i < 500; i++) warn('origin', 'Rejected origin B');
    expect(lines).toEqual(['Rejected origin A']);

    now = 60_000;
    warn('origin', 'Rejected origin C');
    expect(lines).toEqual(['Rejected origin A', 'Rejected origin C (+500 similar since the last report)']);
  });

  it('throttles each key separately', () => {
    const { lines, logger } = capture();
    const warn = createThrottledWarn(logger, 60_000, () => 0);
    warn('origin', 'o1');
    warn('per-ip', 'p1');
    warn('origin', 'o2');
    expect(lines).toEqual(['o1', 'p1']);
  });
});
