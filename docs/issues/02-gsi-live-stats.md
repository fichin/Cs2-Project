## Context

Builds on the GSI receiver issue. Once payloads arrive, the client should show my own live match in real time over the existing WebSocket.

## Scope

- Normalize GSI payloads into a `MyMatch` model in `/shared` (map name, mode, phase, round number, CT/T score, player name, team, kills, deaths, assists, MVPs, score, and ADR **if derivable**: GSI exposes `round_totaldmg` per round, so ADR = sum(round damage) / rounds played, accumulated on the server).
- New protocol messages (e.g. `gsi_snapshot` / `gsi_update`) with a protocol version bump and zod validation on both ends.
- Only broadcast when something changed (reuse the diff approach). Throttle to at most a few updates per second.
- Client: a **"My match"** panel above the scoreboard, clearly labeled *"From your CS2 client (Game State Integration)"* so it's never confused with PandaScore data. Hidden when no GSI data has arrived in the last N minutes.
- Accessibility: round/score changes announced via the existing aria-live region (rate-limited so it isn't noisy).

## Acceptance criteria

- [ ] Shared `MyMatch` type and new message types with validation and tests
- [ ] Server keeps per-session GSI state, computes ADR when round damage is present, and resets on map change
- [ ] "My match" panel shows map, round, score, K/D/A, ADR (or hides the ADR field cleanly when unknown)
- [ ] Panel carries a visible "from your own client" label and is absent when there's no GSI data
- [ ] Unit tests for normalization and ADR using recorded payloads; component test for the panel
- [ ] Works alongside both PandaScore and fixture sources
