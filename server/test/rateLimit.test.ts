import { describe, expect, it } from 'vitest';
import { Backoff, RequestBudget, parseRetryAfter } from '../src/rateLimit.js';

describe('RequestBudget', () => {
  it('allows up to the limit within the window, then refuses', () => {
    let now = 0;
    const budget = new RequestBudget(3, 1000, () => now);
    expect([budget.tryAcquire(), budget.tryAcquire(), budget.tryAcquire()]).toEqual([true, true, true]);
    expect(budget.tryAcquire()).toBe(false);
    expect(budget.remaining()).toBe(0);
    expect(budget.msUntilAvailable()).toBe(1000);

    now = 999;
    expect(budget.tryAcquire()).toBe(false);
    now = 1000; // the first requests slide out of the window
    expect(budget.remaining()).toBe(3);
    expect(budget.tryAcquire()).toBe(true);
  });

  it('pauses when the upstream reports it is nearly exhausted', () => {
    let now = 0;
    const budget = new RequestBudget(100, 60_000, () => now);
    budget.observeUpstreamRemaining(500, 50, 10_000);
    expect(budget.tryAcquire()).toBe(true);
    budget.observeUpstreamRemaining(40, 50, 10_000);
    expect(budget.tryAcquire()).toBe(false);
    expect(budget.msUntilAvailable()).toBe(10_000);
    now = 10_000;
    expect(budget.tryAcquire()).toBe(true);
  });
});

describe('Backoff', () => {
  it('grows exponentially and is capped (jitter at its maximum)', () => {
    const b = new Backoff({ baseMs: 1000, maxMs: 8000, random: () => 1 });
    expect([b.next(), b.next(), b.next(), b.next(), b.next()]).toEqual([1000, 2000, 4000, 8000, 8000]);
    expect(b.attempts).toBe(5);
  });

  it('applies equal jitter: never less than half the exponential delay', () => {
    const b = new Backoff({ baseMs: 1000, maxMs: 60_000, random: () => 0 });
    expect([b.next(), b.next(), b.next()]).toEqual([500, 1000, 2000]);
  });

  it('reset starts over', () => {
    const b = new Backoff({ baseMs: 100, maxMs: 1000, random: () => 1 });
    b.next();
    b.next();
    b.reset();
    expect(b.next()).toBe(100);
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds and HTTP dates', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    const now = Date.parse('2026-10-06T12:00:00Z');
    expect(parseRetryAfter('Tue, 06 Oct 2026 12:00:30 GMT', now)).toBe(30_000);
  });

  it('returns null for missing or garbage values', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});
