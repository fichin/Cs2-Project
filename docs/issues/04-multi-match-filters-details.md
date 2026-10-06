## Context

The scoreboard is a single long list today. With dozens of upcoming matches, people need to filter it and drill into one match.

## Scope

- Filters: **status** (live / upcoming / results) and **tournament/league** (built from the current data), plus a free-text team search. Store filter state in the URL query string so views can be shared.
- Match details view at `/match/:id` (client-side routing; pick a small router or a hand-rolled one, no UI library): teams, logos, series score, per-game list from PandaScore `games` (status, winner, position), schedule/stream links, and tournament context.
- Deep links work after a reload; unknown IDs show a friendly not-found state.
- Keyboard and screen-reader friendly filter controls (native `<select>`/`<input>`, labelled).

## Acceptance criteria

- [ ] Status and tournament filters plus team search, reflected in the URL
- [ ] `/match/:id` details page with per-game breakdown that live-updates via the existing WebSocket diffs
- [ ] Empty-filter-result state
- [ ] Shared `Match` model extended (e.g. `games[]`) with protocol version handling and tests
- [ ] Component tests for filters and the details page; no a11y regressions
