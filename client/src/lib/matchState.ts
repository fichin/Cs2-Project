import type { Match, ServerMessage, Source } from '@esports-live/shared';

export interface LiveState {
  /** True once the first snapshot has arrived. */
  hasSnapshot: boolean;
  matches: Record<string, Match>;
  source: Source | null;
  stale: boolean;
  lastUpdated: string | null;
  statusMessage: string | null;
  serverError: string | null;
}

export const initialLiveState: LiveState = {
  hasSnapshot: false,
  matches: {},
  source: null,
  stale: false,
  lastUpdated: null,
  statusMessage: null,
  serverError: null,
};

/** Pure reducer: apply one validated server message to the client state. */
export function applyServerMessage(state: LiveState, msg: ServerMessage): LiveState {
  switch (msg.type) {
    case 'snapshot':
      return {
        ...state,
        hasSnapshot: true,
        matches: Object.fromEntries(msg.matches.map((m) => [m.id, m])),
        source: msg.source,
        stale: msg.stale,
        lastUpdated: msg.lastUpdated,
        statusMessage: msg.message,
        serverError: null,
      };
    case 'diff': {
      // A diff is relative to a snapshot; without one we'd build a partial picture.
      if (!state.hasSnapshot) return state;
      const matches = { ...state.matches };
      for (const id of msg.removed) delete matches[id];
      for (const m of msg.upserted) matches[m.id] = m;
      return { ...state, matches, lastUpdated: msg.serverTime };
    }
    case 'status':
      return {
        ...state,
        source: msg.source,
        stale: msg.stale,
        lastUpdated: msg.lastUpdated ?? state.lastUpdated,
        statusMessage: msg.message,
      };
    case 'error':
      return { ...state, serverError: msg.message };
  }
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

export interface GroupedMatches {
  running: Match[];
  upcoming: Match[];
  finished: Match[];
}

/** Running first (longest-running first), then upcoming (soonest first), then results (newest first). */
export function groupMatches(matches: Iterable<Match>): GroupedMatches {
  const all = [...matches];
  const by = (status: Match['status']) => all.filter((m) => m.status === status);
  const asc = (key: (m: Match) => number) => (a: Match, b: Match) => (key(a) || Infinity) - (key(b) || Infinity);
  return {
    running: by('running').sort(asc((m) => time(m.beginAt ?? m.scheduledAt))),
    upcoming: by('upcoming').sort(asc((m) => time(m.scheduledAt))),
    finished: by('finished').sort(
      (a, b) => (time(b.endAt ?? b.scheduledAt) || 0) - (time(a.endAt ?? a.scheduledAt) || 0),
    ),
  };
}

const teamLabel = (m: Match, i: 0 | 1) => m.teams[i].name;

/** Human-readable announcements for screen readers, describing meaningful changes. */
export function describeChanges(prev: Record<string, Match>, upserted: readonly Match[]): string[] {
  const out: string[] = [];
  for (const next of upserted) {
    const before = prev[next.id];
    const a = teamLabel(next, 0);
    const b = teamLabel(next, 1);
    const score = `${next.teams[0].score}–${next.teams[1].score}`;
    if (!before) continue; // new matches appearing aren't announced (too noisy)
    if (before.status !== 'finished' && next.status === 'finished') {
      const winner = next.teams.find((t) => t.id === next.winnerId)?.name;
      out.push(winner ? `${winner} won: ${a} ${score} ${b}` : `Match finished: ${a} ${score} ${b}`);
    } else if (before.status === 'upcoming' && next.status === 'running') {
      out.push(`Now live: ${a} versus ${b}`);
    } else if (before.teams[0].score !== next.teams[0].score || before.teams[1].score !== next.teams[1].score) {
      out.push(`Score update: ${a} ${score} ${b}`);
    }
  }
  return out;
}
