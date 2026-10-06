import type { Match } from '@esports-live/shared';

export interface MatchDiff {
  upserted: Match[];
  removed: string[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  const ar = a as Record<string, unknown>;
  const br = b as Record<string, unknown>;
  const keys = Object.keys(ar);
  if (keys.length !== Object.keys(br).length) return false;
  return keys.every((k) => Object.prototype.hasOwnProperty.call(br, k) && deepEqual(ar[k], br[k]));
}

export function matchesEqual(a: Match, b: Match): boolean {
  return deepEqual(a, b);
}

/** Compute which matches were added/changed and which disappeared. Order-insensitive. */
export function diffMatches(prev: ReadonlyMap<string, Match>, next: readonly Match[]): MatchDiff {
  const upserted: Match[] = [];
  const seen = new Set<string>();
  for (const match of next) {
    if (seen.has(match.id)) continue; // first occurrence wins if the source sends duplicates
    seen.add(match.id);
    const before = prev.get(match.id);
    if (!before || !matchesEqual(before, match)) upserted.push(match);
  }
  const removed = [...prev.keys()].filter((id) => !seen.has(id));
  return { upserted, removed };
}

export function isEmptyDiff(diff: MatchDiff): boolean {
  return diff.upserted.length === 0 && diff.removed.length === 0;
}
