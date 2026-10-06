import type { Match, ServerMessage } from '@esports-live/shared';

export function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    status: 'running',
    teams: [
      { id: 'a', name: 'Alpha Squad', acronym: 'ALP', logoUrl: null, score: 1 },
      { id: 'b', name: 'Bravo Five', acronym: 'BRV', logoUrl: null, score: 0 },
    ],
    gameNumber: 2,
    mapName: 'Mirage',
    bestOf: 3,
    tournament: 'Test Cup · Playoffs',
    league: 'Test League',
    scheduledAt: '2026-10-06T14:00:00.000Z',
    beginAt: '2026-10-06T14:00:00.000Z',
    endAt: null,
    winnerId: null,
    streamUrl: null,
    source: 'fixture',
    ...overrides,
  };
}

export function snapshot(matches: Match[], extra: Partial<Extract<ServerMessage, { type: 'snapshot' }>> = {}) {
  return {
    type: 'snapshot' as const,
    v: 1 as const,
    source: 'fixture' as const,
    stale: false,
    lastUpdated: '2026-10-06T15:00:00.000Z',
    message: null,
    serverTime: '2026-10-06T15:00:00.000Z',
    matches,
    ...extra,
  };
}

/** Minimal controllable stand-in for the browser WebSocket. */
export class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closedByClient = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  static latest(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error('no socket created');
    return ws;
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  receive(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: typeof data === 'string' ? data : JSON.stringify(data) }));
  }

  /** Server-side / network close. */
  drop(code = 1006): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onerror?.(new Event('error'));
    this.onclose?.(new CloseEvent('close', { code }));
  }

  close(): void {
    this.closedByClient = true;
    this.readyState = FakeWebSocket.CLOSED;
  }

  send(): void {}
}

export const createFakeSocket = (url: string) => new FakeWebSocket(url) as unknown as WebSocket;
