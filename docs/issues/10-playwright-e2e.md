## Context

Unit and component tests cover the logic, but nothing checks the real server + browser + WebSocket path end to end. Phase 1 verified this by hand; automate it.

## Scope

- Add Playwright (Chromium only is fine) as a dev dependency with config at the repo root or in `e2e/`.
- Test harness starts the built server with `FORCE_SOURCE=fixture` and a short `FIXTURE_INTERVAL_MS`, plus `vite preview` for the client. Pick free ports and set `ALLOWED_ORIGIN` to match. **No PandaScore token and no network** in CI.
- Scenarios:
  1. Page loads in demo mode: **DEMO DATA** badge, connection status "Live", at least one match card.
  2. A score/status update appears without reloading.
  3. Stopping the server shows "Reconnecting…" and the connection-lost banner. Restarting recovers to "Live".
- Run in CI as a separate job after build; upload the Playwright report/trace on failure.

## Acceptance criteria

- [ ] `npm run test:e2e` runs locally and in CI
- [ ] The three scenarios above pass reliably (no fixed sleeps; use web-first assertions)
- [ ] CI job caches Playwright browsers and uploads artifacts on failure
- [ ] README documents how to run e2e tests
