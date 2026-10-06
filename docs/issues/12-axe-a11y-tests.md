## Context

Phase 1 was built for WCAG AA (contrast checked by script, semantic HTML, aria-live, keyboard support), but nothing automated stops regressions.

## Scope

- Add `axe-core` (e.g. via `vitest-axe` or `jest-axe` matchers) to the client component tests.
- Run axe on: the scoreboard with data, skeleton/loading, empty state, error/offline state, notices (stale, reconnecting, waking up), and the source badges.
- When Playwright e2e lands, add `@axe-core/playwright` checks to the e2e flow as well (separate follow-up if needed).
- Fix any violations found.

## Acceptance criteria

- [ ] axe assertions run in `npm test` for all states listed above
- [ ] Zero violations (or documented, justified exceptions)
- [ ] CONTRIBUTING mentions that new components need an axe check
