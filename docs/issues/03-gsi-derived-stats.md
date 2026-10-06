## Context

GSI sends point-in-time state, not events. Interesting stats (multi-kills, clutches, etc.) have to be **derived** from the stream of round states. This issue adds a pure, well-tested derivation module.

## Scope

- Pure functions in the server (no I/O) that consume the ordered GSI state stream and produce:
  - **K/D**, **KPR** (kills per round)
  - **Multi-kills** per round (2K/3K/4K) and **aces** (5K), using `player_state.round_kills`
  - **Clutches** (1vX won): last alive on my team while X opponents alive, and the round won by my team (needs `allplayers` when available; otherwise mark as "not derivable" rather than guessing)
- Record real sample payload sequences (sanitized: no SteamIDs or tokens) into `server/test/fixtures/gsi/` and test against them.
- Expose derived stats in the "My match" panel.

## Acceptance criteria

- [ ] Derivation module with no side effects and 100% branch coverage on the counting logic
- [ ] Recorded fixture sequences covering: a normal round, a 3K, an ace, a 1v2 clutch won, a clutch lost, a map change/reset
- [ ] Stats that can't be derived from the available fields return `null` and the UI hides them (no fake numbers)
- [ ] Derived stats are shown in the "My match" panel with tests
- [ ] Fixtures contain no personal identifiers or tokens
