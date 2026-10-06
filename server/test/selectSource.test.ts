import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { silentLogger } from '../src/logger.js';
import { FixtureSource } from '../src/sources/fixtureSource.js';
import { PandaScoreSource } from '../src/sources/pandascore/pandascoreSource.js';
import { selectSource } from '../src/sources/selectSource.js';

const cfg = (env: Record<string, string | undefined>) => parseConfig(env);

describe('selectSource', () => {
  it('uses PandaScore when a token is configured', () => {
    const sel = selectSource(cfg({ PANDASCORE_TOKEN: 'fake-token-123' }), silentLogger);
    expect(sel.source).toBeInstanceOf(PandaScoreSource);
    expect(sel.source.kind).toBe('pandascore');
    expect(sel.intervalMs).toBe(30_000);
    expect(sel.reason).not.toContain('fake-token-123');
  });

  it('uses fixtures when the token is missing or blank', () => {
    for (const env of [{}, { PANDASCORE_TOKEN: '' }, { PANDASCORE_TOKEN: '   ' }]) {
      const sel = selectSource(cfg(env), silentLogger);
      expect(sel.source).toBeInstanceOf(FixtureSource);
      expect(sel.source.kind).toBe('fixture');
      expect(sel.reason).toBe('PANDASCORE_TOKEN is not set');
    }
  });

  it('FORCE_SOURCE=fixture wins over a token', () => {
    const sel = selectSource(cfg({ PANDASCORE_TOKEN: 'fake', FORCE_SOURCE: 'fixture' }), silentLogger);
    expect(sel.source.kind).toBe('fixture');
  });
});

describe('parseConfig', () => {
  it('applies defaults and never polls faster than the floor', () => {
    const c = parseConfig({ POLL_INTERVAL_MS: '1000' });
    expect(c.POLL_INTERVAL_MS).toBe(10_000);
    expect(c.PORT).toBe(3001);
    expect(c.ALLOWED_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('accepts a comma-separated origin list', () => {
    expect(parseConfig({ ALLOWED_ORIGIN: 'https://a.dev/, http://b.dev' }).ALLOWED_ORIGIN).toEqual([
      'https://a.dev',
      'http://b.dev',
    ]);
  });

  it('reports invalid variables by name only, never by value', () => {
    expect(() => parseConfig({ PORT: 'not-a-port-secretvalue' })).toThrow(/PORT/);
    expect(() => parseConfig({ PORT: 'not-a-port-secretvalue' })).not.toThrow(/secretvalue/);
  });
});
