## Context

Live cards currently show "Map N" for PandaScore matches and "Map N · Mirage" for fixtures. The free PandaScore plan doesn't provide **map names or round scores** (real-time data is paid). Users should see this information when a source has it, and nothing broken when it doesn't.

## Scope

- Extend the shared model with optional `currentMap: { name, roundScore: [a, b], roundNumber } | null`.
- Fill it from: fixtures (simulated rounds), GSI (own match only, from the GSI issues), and PandaScore **only if** a plan with real-time/map data is available.
- UI: show the map name and round score when present; otherwise hide the fields entirely (no "N/A" placeholders) and keep the layout stable.

## Blocked

The PandaScore part is **blocked** by plan limitations (free plan = schedules/results only). The fixture and GSI parts can go ahead.

## Acceptance criteria

- [ ] Optional map/round fields in the shared model with tests
- [ ] Fixture source simulates round scores within a map
- [ ] UI hides the fields cleanly when null (component test for both cases)
- [ ] README "Data sources" updated with what each source provides
