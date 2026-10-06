import type { Match, Team } from '@esports-live/shared';
import type { Clock } from '../rateLimit.js';
import type { MatchSource } from './MatchSource.js';

/*
 * Demo data that "plays itself": matches are laid out on a repeating schedule and their
 * state (upcoming -> running map by map -> finished) is derived purely from the clock, so the
 * UI is alive offline and tests are deterministic. All names are fictional and the whole
 * set is tagged `source: "fixture"` so the UI labels it as DEMO DATA.
 */

const TEAMS: ReadonlyArray<Omit<Team, 'score' | 'logoUrl'>> = [
  { id: 'fx-northwind', name: 'Northwind Esports', acronym: 'NWE' },
  { id: 'fx-polar', name: 'Polar Lynx', acronym: 'PLX' },
  { id: 'fx-kestrel', name: 'Red Kestrel', acronym: 'RKS' },
  { id: 'fx-ironclad', name: 'Ironclad Five', acronym: 'IC5' },
  { id: 'fx-vanguard', name: 'Nova Vanguard', acronym: 'NOVA' },
  { id: 'fx-static', name: 'Static Wolves', acronym: 'STW' },
  { id: 'fx-ember', name: 'Ember Owls', acronym: 'EMB' },
  { id: 'fx-glacier', name: 'Glacier Gaming', acronym: 'GLC' },
];

const MAPS = ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Train'] as const;
const TOURNAMENTS = ['Demo Masters 2026 · Playoffs', 'Fixture League · Week 4', 'Offline Open · Group B'];

/** Matches start every SLOT_MS; the schedule repeats every SLOTS_PER_CYCLE slots. */
export const SLOT_MS = 90_000;
export const MAP_MS = 50_000;
const SLOTS_PER_CYCLE = 8;
const CYCLE_MS = SLOT_MS * SLOTS_PER_CYCLE;
// Shortest possible match (2-0 in a bo3 = 100s) outlasts a slot, so something is always live.
const BEST_OF = [3, 3, 5, 3, 3, 3, 5, 3] as const;

const MAX_UPCOMING = 6;
const MAX_FINISHED = 6;

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMatch(globalSlot: number, now: number): Match {
  const rand = rng(globalSlot * 7919 + 17);
  const slot = ((globalSlot % SLOTS_PER_CYCLE) + SLOTS_PER_CYCLE) % SLOTS_PER_CYCLE;
  const bestOf = BEST_OF[slot] ?? 3;
  const aIdx = Math.floor(rand() * TEAMS.length);
  const bIdx = (aIdx + 1 + Math.floor(rand() * (TEAMS.length - 1))) % TEAMS.length;
  const mapOrder = [...MAPS].sort(() => rand() - 0.5);
  const winsNeeded = Math.ceil(bestOf / 2);

  const startAt = globalSlot * SLOT_MS;
  const elapsed = now - startAt;
  const mapsPlayed = elapsed < 0 ? 0 : Math.floor(elapsed / MAP_MS);

  const score: [number, number] = [0, 0];
  let finishedAfter: number | null = null;
  for (let i = 0; i < mapsPlayed; i++) {
    const winner = rand() < 0.5 ? 0 : 1;
    score[winner] += 1;
    if (score[winner] >= winsNeeded) {
      finishedAfter = i + 1;
      break;
    }
  }

  const status = elapsed < 0 ? 'upcoming' : finishedAfter !== null ? 'finished' : 'running';
  const team = (idx: number, s: number): Team => ({ ...TEAMS[idx]!, logoUrl: null, score: s });
  const gameNumber = status === 'upcoming' ? null : status === 'running' ? mapsPlayed + 1 : finishedAfter;
  const winnerIdx = status === 'finished' ? (score[0] > score[1] ? aIdx : bIdx) : null;

  return {
    id: `fx-${globalSlot}`,
    status,
    teams: [team(aIdx, score[0]), team(bIdx, score[1])],
    gameNumber,
    mapName: gameNumber === null ? null : (mapOrder[(gameNumber - 1) % mapOrder.length] ?? null),
    bestOf,
    tournament: TOURNAMENTS[slot % TOURNAMENTS.length]!,
    league: 'Demo data',
    scheduledAt: new Date(startAt).toISOString(),
    beginAt: status === 'upcoming' ? null : new Date(startAt).toISOString(),
    endAt: finishedAfter === null ? null : new Date(startAt + finishedAfter * MAP_MS).toISOString(),
    winnerId: winnerIdx === null ? null : TEAMS[winnerIdx]!.id,
    streamUrl: null,
    source: 'fixture',
  };
}

export class FixtureSource implements MatchSource {
  readonly kind = 'fixture' as const;

  constructor(private readonly now: Clock = Date.now) {}

  async fetchMatches(): Promise<Match[]> {
    return this.matchesAt(this.now());
  }

  matchesAt(now: number): Match[] {
    const currentSlot = Math.floor(now / SLOT_MS);
    // Look back far enough to find recent results and the longest (bo5) match still running.
    const all: Match[] = [];
    for (let s = currentSlot - SLOTS_PER_CYCLE; s <= currentSlot + MAX_UPCOMING; s++) all.push(buildMatch(s, now));

    const running = all.filter((m) => m.status === 'running');
    const upcoming = all.filter((m) => m.status === 'upcoming').slice(0, MAX_UPCOMING);
    const finished = all
      .filter((m) => m.status === 'finished')
      .sort((a, b) => (b.endAt ?? '').localeCompare(a.endAt ?? ''))
      .slice(0, MAX_FINISHED);
    return [...running, ...upcoming, ...finished];
  }
}

export const FIXTURE_CYCLE_MS = CYCLE_MS;
