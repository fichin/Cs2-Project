import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { FixtureSource } from './fixtureSource.js';
import type { MatchSource } from './MatchSource.js';
import { PandaScoreSource } from './pandascore/pandascoreSource.js';

export interface SourceSelection {
  source: MatchSource;
  /** Human-readable, secret-free reason, logged at startup. */
  reason: string;
  /** Poll interval to use with this source. */
  intervalMs: number;
}

export function selectSource(
  config: Pick<Config, 'PANDASCORE_TOKEN' | 'FORCE_SOURCE' | 'POLL_INTERVAL_MS' | 'FIXTURE_INTERVAL_MS'>,
  logger: Logger,
  fetchImpl?: typeof fetch,
): SourceSelection {
  const fixture = (reason: string): SourceSelection => ({
    source: new FixtureSource(),
    reason,
    // Fixtures are local, so they can tick faster than the upstream poll interval.
    intervalMs: Math.min(config.FIXTURE_INTERVAL_MS, config.POLL_INTERVAL_MS),
  });

  if (config.FORCE_SOURCE === 'fixture') return fixture('FORCE_SOURCE=fixture');
  if (!config.PANDASCORE_TOKEN) {
    return fixture(
      config.FORCE_SOURCE === 'pandascore'
        ? 'FORCE_SOURCE=pandascore but PANDASCORE_TOKEN is not set'
        : 'PANDASCORE_TOKEN is not set',
    );
  }
  return {
    source: new PandaScoreSource({ token: config.PANDASCORE_TOKEN, logger, fetch: fetchImpl }),
    reason: 'PANDASCORE_TOKEN is set',
    intervalMs: config.POLL_INTERVAL_MS,
  };
}
