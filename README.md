# esports-live

A live **Counter-Strike 2** match tracker. A small Node server polls an esports data provider,
normalizes the matches, works out what changed and pushes only those changes to browsers over a
**native WebSocket**. The React client shows a live scoreboard that updates without a refresh:
live matches first, then upcoming matches, then recent results.

- Real data comes from the [PandaScore](https://pandascore.co) REST API, using the free *Schedules, Results & Context Data* plan.
- Without a token, a built-in **demo data** source plays out fake matches so the UI still works offline. The UI always labels which source is active.

## Why native WebSockets?

- **One-way push is all we need.** The server broadcasts snapshots and diffs and clients only listen. The
  `ws` library plus the browser's built-in `WebSocket` cover that without Socket.io's protocol, client bundle
  or fallbacks.
- **Explicit control.** Heartbeats (ping/pong), maximum payload size, per-IP connection limits, Origin checks,
  backpressure and graceful close are each a few visible lines in [`server/src/wsHub.ts`](server/src/wsHub.ts) rather than
  framework defaults.
- **Typed protocol.** Messages are defined once with zod in [`shared/`](shared/src/protocol.ts) and validated on both
  ends: the server refuses to send a malformed frame and the client ignores one.

## Architecture

```
                          (every POLL_INTERVAL_MS, budgeted & cached)
  ┌──────────────────┐   HTTPS + Authorization: Bearer   ┌──────────────────────────────────────┐
  │ PandaScore REST  │ ◄──────────────────────────────── │  server (Node + Express + ws)        │
  │  /csgo/matches/  │ ────────────────────────────────► │                                      │
  │  running|upcoming│        JSON (validated by zod)    │  MatchSource (adapter)               │
  │  |past           │                                   │   ├─ PandaScoreSource ─┐  normalize  │
  └──────────────────┘                                   │   └─ FixtureSource ────┴─► Match[]   │
                                                         │                │                     │
                                                         │  Poller ── diff vs MatchStore        │
                                                         │      │  (stale=true on failure,      │
                                                         │      │   exponential backoff)        │
                                                         │      ▼                               │
                                                         │  WsHub  /ws   ── GET /health         │
                                                         └──────┬───────────────────────────────┘
                                         snapshot on connect,   │  native WebSocket
                                         then diff / status     │  (Origin check, heartbeat,
                                                                ▼   max payload, per-IP limit)
                                                   ┌──────────────────────────────┐
                                                   │ client (React + Vite)        │
                                                   │  useLiveMatches: reconnect   │
                                                   │  w/ backoff + jitter, status │
                                                   │  Scoreboard + aria-live      │
                                                   └──────────────────────────────┘
```

| Folder    | What's inside |
| --------- | ------------- |
| `shared/` | `Match` model and WebSocket message types (`snapshot`, `diff`, `status`, `error`), plus zod validators |
| `server/` | Express + `ws` server, `MatchSource` adapters, poll/diff loop, rate-limit and backoff logic, token redaction |
| `client/` | React + TypeScript + Vite UI in plain CSS with design tokens and no UI library |

### Wire protocol (server → client)

| `type`     | When | Payload |
| ---------- | ---- | ------- |
| `snapshot` | Immediately after connecting, and after a source switch | `source`, `stale`, `lastUpdated`, all `matches` |
| `diff`     | After a poll that changed something | `upserted: Match[]`, `removed: id[]` |
| `status`   | Freshness or source changed (e.g. upstream down, so `stale: true`) | `source`, `stale`, `lastUpdated`, `message` |
| `error`    | Server-side problem worth showing | `code`, `message` |

Every message carries `v: 1`, the protocol version.

## Running locally

Requirements: Node 20 or newer (developed on Node 24) and npm 10 or newer.

```bash
npm install

# optional: real data
cp server/.env.example server/.env    # then set PANDASCORE_TOKEN=... in server/.env

npm run dev            # server on :3001 and client on :5173 together
# or run them separately:
npm run dev -w server
npm run dev -w client
```

Open http://localhost:5173. Check the server with `curl http://localhost:3001/health`.

Other scripts (run from the repo root):

```bash
npm run lint        # ESLint (flat config) over all workspaces
npm run typecheck   # tsc --noEmit in shared, server and client
npm test            # Vitest in shared, server and client (no network access)
npm run build       # server -> server/dist (tsup), client -> client/dist (vite)
npm start           # run the built server
```

## Environment variables

Server (`server/.env`, loaded with dotenv; see `server/.env.example`):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PANDASCORE_TOKEN` | *(empty)* | PandaScore API token. If set, live data is used; if empty, demo fixtures. **Server only.** |
| `PORT` | `3001` | HTTP and WebSocket port |
| `POLL_INTERVAL_MS` | `30000` | Upstream poll interval. Values below 10,000 are raised to 10,000. |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | Comma-separated list of origins allowed to open the WebSocket |
| `MAX_CONNECTIONS_PER_IP` | `10` | Concurrent WebSocket connections allowed per IP |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy so the per-IP limit uses `X-Forwarded-For` |
| `FORCE_SOURCE` | *(empty)* | `fixture` forces demo data even when a token is set |
| `FIXTURE_INTERVAL_MS` | `5000` | Tick interval for demo data (local only, no API cost) |
| `HOST` | *(all interfaces)* | Bind address |

Client (`client/.env`, see `client/.env.example`):

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VITE_WS_URL` | `ws://<page host>:3001/ws` | WebSocket URL of the server. Anything `VITE_*` is public, so never put secrets here. |

## Data sources (read this)

**PandaScore, free plan.** Facts checked against the official docs:

- Base URL `https://api.pandascore.co`. The token is sent as `Authorization: Bearer …` and never as the
  `?token=` query parameter, so it can't end up in URLs or logs.
- CS2 is still served under the **`/csgo`** slug. CS2 is selected with `filter[videogame_title]=cs-2`.
- Endpoints used: `/csgo/matches/running`, `/csgo/matches/upcoming`, `/csgo/matches/past`, first page only
  (`page[size]` up to 100).
- The free plan allows **1,000 requests/hour**. This app budgets itself to 600/hour (60%) and normally uses
  about **144/hour**: `running` on every 30 s poll, and `upcoming`/`past` cached for 5 minutes. It also reads
  `X-Rate-Limit-Remaining` and pauses if the provider reports fewer than 50 left, backs off exponentially on
  429/5xx (honouring `Retry-After`), and never polls faster than `POLL_INTERVAL_MS`.
- When the API fails, the server keeps serving the **last good state** with `stale: true`, and the UI shows
  an "out of date" notice. If the token is rejected (401/403), the server switches to demo data and says so.

**What the free plan does *not* give you.** It covers schedules and results: who plays whom and when, the
series score (maps won), best-of format, tournament and streams. **Real-time per-round data is not
available** on this plan, so there are no round scores, map names, player stats or kill feeds. Those need
PandaScore's paid real-time plans. Because data arrives by polling, a map result can show up in the UI up to
about 30 s after it happens.

**Fixtures are demo data.** `FixtureSource` generates fictional teams and tournaments on a repeating
schedule driven by the clock. They are always tagged `source: "fixture"` and shown with a **DEMO DATA**
badge. They are not real matches.

## Security notes

- The PandaScore token lives only in `server/.env`, which is git-ignored. It is never sent to the browser,
  logged, or included in tests or fixtures.
- Every log line passes through a redactor that masks the known token, plus any `token=` query parameter or
  `Bearer` credential.
- WebSocket hardening: Origin allow-list, 1 KB maximum inbound payload (clients don't need to send
  anything), per-IP connection cap, heartbeat that terminates dead peers, and disconnection of clients that
  fall too far behind (backpressure).
- Logo and stream URLs from the API are only passed to the browser if they are `http(s)` URLs.

## Accessibility

Semantic landmarks and headings, a skip link, visible focus styles, colour tokens checked against WCAG
AA in both dark and light schemes, a polite `aria-live` region that announces score changes, full
keyboard operation, `prefers-reduced-motion` support, and a responsive layout from 360px wide.
