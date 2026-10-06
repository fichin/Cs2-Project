import { describe, expect, it } from 'vitest';
import { formatAgo, formatCountdown, initials } from './format';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('formatCountdown', () => {
  it('formats seconds, minutes, hours and days', () => {
    expect(formatCountdown(at(45_000), NOW)).toBe('in 45s');
    expect(formatCountdown(at(12 * 60_000 + 5_000), NOW)).toBe('in 12m 05s');
    expect(formatCountdown(at(3 * 3_600_000 + 12 * 60_000), NOW)).toBe('in 3h 12m');
    expect(formatCountdown(at(50 * 3_600_000), NOW)).toBe('in 2d 2h');
  });

  it('handles overdue and unknown times', () => {
    expect(formatCountdown(at(-1000), NOW)).toBe('Starting soon');
    expect(formatCountdown(null, NOW)).toBe('Time TBD');
    expect(formatCountdown('garbage', NOW)).toBe('Time TBD');
  });
});

describe('formatAgo', () => {
  it('formats relative past times', () => {
    expect(formatAgo(at(-10_000), NOW)).toBe('just now');
    expect(formatAgo(at(-5 * 60_000), NOW)).toBe('5 min ago');
    expect(formatAgo(at(-3 * 3_600_000), NOW)).toBe('3 h ago');
    expect(formatAgo(at(-30 * 3_600_000), NOW)).toBe('1 day ago');
    expect(formatAgo(null, NOW)).toBeNull();
  });
});

describe('initials', () => {
  it('builds logo fallbacks', () => {
    expect(initials('Natus Vincere')).toBe('NV');
    expect(initials('9z')).toBe('9Z');
    expect(initials('ex-RUSTEC')).toBe('ER');
    expect(initials('   ')).toBe('?');
  });
});
