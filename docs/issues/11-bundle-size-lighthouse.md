## Context

The client bundle is ~324 KB (~99 KB gzipped) in Phase 1, mostly React + **zod** (used to validate WebSocket messages). For a scoreboard that should load fast on mobile and on a sleeping free-tier backend, we can do better and should guard against regressions.

## Scope

- Measure first (`vite build` + `rollup-plugin-visualizer` or `vite-bundle-visualizer`).
- Options: `zod/mini` (tree-shakable) or a small hand-written validator for the client while keeping zod on the server. Check whether shared schemas can be split so the server keeps full zod.
- Add **Lighthouse CI** (`@lhci/cli`) against `vite preview` in demo mode, with budgets: performance ≥ 90, accessibility ≥ 95, best-practices ≥ 90; JS ≤ 80 KB gzipped (adjust after measuring).

## Acceptance criteria

- [ ] Bundle analysis documented in the PR (before/after numbers)
- [ ] Gzipped JS reduced meaningfully (target ≤ 70 KB) without losing message validation
- [ ] Lighthouse CI runs in GitHub Actions with the budgets above and fails the build on regression
- [ ] No behaviour change (all existing tests still pass)
