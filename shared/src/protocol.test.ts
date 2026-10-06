import { describe, expect, it } from 'vitest';
import type { Match } from './match.js';
import { PROTOCOL_VERSION, parseServerMessage, serializeServerMessage } from './protocol.js';

const match: Match = {
  id: 'fx-1',
  status: 'running',
  teams: [
    { id: 'a', name: 'Alpha', acronym: 'ALP', logoUrl: null, score: 1 },
    { id: 'b', name: 'Bravo', acronym: null, logoUrl: 'https://example.com/b.png', score: 0 },
  ],
  gameNumber: 2,
  mapName: 'Mirage',
  bestOf: 3,
  tournament: 'Demo Cup',
  league: null,
  scheduledAt: '2026-10-06T14:00:00Z',
  beginAt: '2026-10-06T14:05:00Z',
  endAt: null,
  winnerId: null,
  streamUrl: null,
  source: 'fixture',
};

describe('parseServerMessage', () => {
  it('accepts a valid snapshot (string frame)', () => {
    const frame = JSON.stringify({
      type: 'snapshot',
      v: PROTOCOL_VERSION,
      source: 'fixture',
      stale: false,
      lastUpdated: null,
      message: null,
      serverTime: '2026-10-06T15:00:00Z',
      matches: [match],
    });
    const result = parseServerMessage(frame);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.type).toBe('snapshot');
  });

  it('accepts diff, status and error messages', () => {
    const msgs = [
      { type: 'diff', v: 1, serverTime: 'x', upserted: [match], removed: ['fx-9'] },
      { type: 'status', v: 1, source: 'pandascore', stale: true, lastUpdated: null, message: 'upstream down' },
      { type: 'error', v: 1, code: 'RATE_LIMITED', message: 'slow down' },
    ];
    for (const m of msgs) expect(parseServerMessage(m).ok).toBe(true);
  });

  it('rejects invalid JSON, unknown types, wrong versions and bad shapes', () => {
    expect(parseServerMessage('{not json')).toEqual({ ok: false, error: 'invalid JSON' });
    expect(parseServerMessage({ type: 'hello', v: 1 }).ok).toBe(false);
    expect(parseServerMessage({ type: 'diff', v: 2, serverTime: 'x', upserted: [], removed: [] }).ok).toBe(false);
    expect(
      parseServerMessage({ type: 'diff', v: 1, serverTime: 'x', upserted: [{ ...match, teams: [] }], removed: [] }).ok,
    ).toBe(false);
    expect(
      parseServerMessage({ type: 'diff', v: 1, serverTime: 'x', upserted: [{ ...match, status: 'paused' }], removed: [] })
        .ok,
    ).toBe(false);
    expect(parseServerMessage(null).ok).toBe(false);
  });

  it('serializeServerMessage round-trips and refuses malformed messages', () => {
    const msg = { type: 'error', v: 1, code: 'X', message: 'y' } as const;
    expect(parseServerMessage(serializeServerMessage(msg))).toEqual({ ok: true, message: msg });
    expect(() => serializeServerMessage({ type: 'error', v: 1, code: 1 } as never)).toThrow();
  });
});
