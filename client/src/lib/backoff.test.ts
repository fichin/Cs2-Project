import { describe, expect, it } from 'vitest';
import { DEFAULT_RECONNECT, reconnectDelay } from './backoff';

describe('reconnectDelay', () => {
  const opts = { baseMs: 500, maxMs: 8_000 };

  it('grows exponentially up to the cap (max jitter)', () => {
    const delays = [0, 1, 2, 3, 4, 5, 10].map((n) => reconnectDelay(n, opts, () => 1));
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('never drops below half of the exponential step (min jitter)', () => {
    expect([0, 1, 2].map((n) => reconnectDelay(n, opts, () => 0))).toEqual([250, 500, 1000]);
  });

  it('jitter spreads clients apart', () => {
    const values = new Set(Array.from({ length: 20 }, (_, i) => reconnectDelay(3, opts, () => i / 20)));
    expect(values.size).toBe(20);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(2000);
      expect(v).toBeLessThanOrEqual(4000);
    }
  });

  it('treats negative attempts as the first attempt and has sane defaults', () => {
    expect(reconnectDelay(-3, opts, () => 1)).toBe(500);
    expect(reconnectDelay(100, DEFAULT_RECONNECT, () => 1)).toBe(DEFAULT_RECONNECT.maxMs);
  });
});
