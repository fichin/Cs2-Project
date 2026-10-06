## Context

Show a bracket for playoff-style tournaments, if the free PandaScore data supports it.

## Investigation (done 2026-10-06, free "Schedules, Results & Context Data" plan)

Probed with the project token (3 requests). Findings:

- `GET /csgo/tournaments/running` → 200. Tournament objects include **`has_bracket`** (8 of 12 running CS2 tournaments had `has_bracket: true`, e.g. "ESL Pro League – Playoffs").
- `GET /tournaments/{id}/brackets` → **200 on the free plan**. Returns the tournament's matches with the normal match fields plus **`previous_matches: [{ type: "winner" | "loser", match_id }]`**, which is enough to build the tree, including lower brackets (via `"loser"` edges). Matches not yet decided use `TBD vs TBD` names and empty opponents.
- `GET /tournaments/{id}/standings` → 200 on the free plan. Returns `rank`, `team`, `last_match` (useful for group stages that have no bracket).
- Conclusion: **feasible without a paid plan.** Rate-limit cost is small if cached (brackets change only when a match finishes).

## Scope

- Server: `BracketSource` (or an extension of `PandaScoreSource`) that fetches brackets for tournaments with `has_bracket`, caches them for 5–10 minutes, and invalidates when a related match finishes. Validate with zod and map to a shared `Bracket` model (nodes plus winner/loser edges).
- Fixture equivalent for demo mode.
- Client: bracket view (CSS grid/SVG, no library) with upper/lower brackets, horizontal scroll on mobile, and links to match details; standings table for group stages.

## Acceptance criteria

- [ ] Shared `Bracket` model and mapper tested against saved sample JSON (no network calls in tests)
- [ ] Brackets cached; request budget stays well under 1,000/h (documented in README)
- [ ] Bracket view renders upper and lower brackets from `previous_matches`; TBD slots render cleanly
- [ ] Standings table for tournaments without a bracket
- [ ] Usable at 360px (scrollable region with keyboard access) and accessible (lists/headings, not just visuals)
