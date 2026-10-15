import { describe, expect, it } from 'vitest';
import type { Match } from './match.js';
import { PROTOCOL_VERSION, parseServerMessage, serializeServerMessage } from './protocol.js';

const match: Match = {
  id: 'fx-1',
  status: 'running',
  teams: [
    { id: 'a', name: 'Alpha', acronym: 'ALP', logoUrl: null, score: 1 },
    {
      id: 'b',
      name: 'Bravo',
      acronym: null,
      logoUrl: 'https://example.com/b.png',
      score: 0,
    },
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

  it('accepts diff, status, error and heartbeat messages', () => {
    const msgs = [
      {
        type: 'diff',
        v: 1,
        serverTime: 'x',
        upserted: [match],
        removed: ['fx-9'],
      },
      {
        type: 'status',
        v: 1,
        source: 'pandascore',
        stale: true,
        lastUpdated: null,
        message: 'upstream down',
      },
      { type: 'error', v: 1, code: 'RATE_LIMITED', message: 'slow down' },
      { type: 'heartbeat', v: 1, serverTime: 'x' },
    ];
    for (const m of msgs) expect(parseServerMessage(m).ok).toBe(true);
  });

  it('rejects invalid JSON, unknown types, wrong versions and bad shapes', () => {
    expect(parseServerMessage('{not json')).toEqual({
      ok: false,
      error: 'invalid JSON',
    });
    expect(parseServerMessage({ type: 'hello', v: 1 }).ok).toBe(false);
    expect(
      parseServerMessage({
        type: 'diff',
        v: 2,
        serverTime: 'x',
        upserted: [],
        removed: [],
      }).ok,
    ).toBe(false);
    expect(
      parseServerMessage({
        type: 'diff',
        v: 1,
        serverTime: 'x',
        upserted: [{ ...match, teams: [] }],
        removed: [],
      }).ok,
    ).toBe(false);
    expect(
      parseServerMessage({
        type: 'diff',
        v: 1,
        serverTime: 'x',
        upserted: [{ ...match, status: 'paused' }],
        removed: [],
      }).ok,
    ).toBe(false);
    expect(parseServerMessage(null).ok).toBe(false);
  });

  it('serializeServerMessage round-trips and refuses malformed messages', () => {
    const msg = { type: 'error', v: 1, code: 'X', message: 'y' } as const;
    expect(parseServerMessage(serializeServerMessage(msg))).toEqual({
      ok: true,
      message: msg,
    });
    expect(() => serializeServerMessage({ type: 'error', v: 1, code: 1 } as never)).toThrow();
  });

  it('rejects a heartbeat with a missing or invalid field', () => {
    expect(parseServerMessage({ type: 'heartbeat', v: 1 }).ok).toBe(false); // missing serverTime
    expect(parseServerMessage({ type: 'heartbeat', v: 1, serverTime: 123 }).ok).toBe(false); // wrong type
  });

  it('accepts a snapshot with or without heartbeatMs, and rejects a bad heartbeatMs', () => {
    const base = {
      type: 'snapshot',
      v: 1,
      source: 'pandascore',
      stale: false,
      lastUpdated: null,
      message: null,
      serverTime: 'x',
      matches: [match],
    };
    expect(parseServerMessage(base).ok).toBe(true); // without heartbeatMs
    expect(parseServerMessage({ ...base, heartbeatMs: 20000 }).ok).toBe(true); // valid
    expect(parseServerMessage({ ...base, heartbeatMs: -5 }).ok).toBe(false); // negative
  });
});

describe('logo and stream URLs', () => {
  const diffWith = (logoUrl: unknown, streamUrl: unknown) => ({
    type: 'diff',
    v: 1,
    serverTime: 'x',
    upserted: [{ ...match, teams: [{ ...match.teams[0], logoUrl }, match.teams[1]], streamUrl }],
    removed: [],
  });
  const firstMatch = (r: ReturnType<typeof parseServerMessage>) =>
    r.ok && r.message.type === 'diff' ? r.message.upserted[0] : undefined;

  it('keeps http(s) URLs and null', () => {
    const r = parseServerMessage(diffWith('https://cdn.example.com/a.png', null));
    expect(firstMatch(r)?.teams[0].logoUrl).toBe('https://cdn.example.com/a.png');
    expect(firstMatch(r)?.streamUrl).toBeNull();
    expect(firstMatch(parseServerMessage(diffWith(null, 'http://kick.com/x')))?.streamUrl).toBe('http://kick.com/x');
  });

  it('drops non-http(s) strings to null instead of rejecting the whole message', () => {
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AA', '/relative.png', 'ftp://x.com', '']) {
      const r = parseServerMessage(diffWith(bad, bad));
      expect(r.ok).toBe(true);
      expect(firstMatch(r)?.teams[0].logoUrl).toBeNull();
      expect(firstMatch(r)?.streamUrl).toBeNull();
    }
  });

  it('still rejects wrong types and missing fields', () => {
    expect(parseServerMessage(diffWith(123, null)).ok).toBe(false);
    const { streamUrl: _omit, ...withoutStream } = match;
    expect(parseServerMessage({ type: 'diff', v: 1, serverTime: 'x', upserted: [withoutStream], removed: [] }).ok).toBe(
      false,
    );
  });
});
