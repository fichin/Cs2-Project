const pad = (n: number) => String(n).padStart(2, '0');

/** "in 45s", "in 12m 05s", "in 3h 12m", "in 2d 4h"; "Starting soon" when overdue. */
export function formatCountdown(targetIso: string | null, now: number): string {
  if (!targetIso) return 'Time TBD';
  const ms = Date.parse(targetIso) - now;
  if (Number.isNaN(ms)) return 'Time TBD';
  if (ms <= 0) return 'Starting soon';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m}m ${pad(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${pad(m % 60)}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatAgo(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function formatLocalTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : timeFmt.format(d);
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
