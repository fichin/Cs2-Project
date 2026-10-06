# Contributing

## Workflow

1. **One branch per issue**, created from an up-to-date `main`:
   `feature/<issue-number>-<short-slug>`, e.g. `feature/8-ws-watchdog`.
   (Use `fix/…`, `docs/…` or `chore/…` instead of `feature/` when that fits better. Work that has no issue,
   like repo housekeeping, uses `chore/<slug>`.)
2. **Conventional commits**, small and focused:
   `feat(client): …`, `fix(server): …`, `test: …`, `docs: …`, `chore: …`, `ci: …`, `refactor: …`, `perf: …`.
3. **Open a pull request** using the template. The description must include `Closes #N` for the issue it
   resolves, so GitHub closes the issue on merge.
4. **CI must be green before merge** (lint, typecheck, test, build). Don't merge red or pending PRs.
5. Prefer **squash merge** with a conventional-commit title, then delete the branch.

## Before pushing

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Rules of the road

- **Secrets never enter the repo.** The PandaScore token lives only in `server/.env` (git-ignored) or in the
  hosting provider's secret settings. Never log it, put it in tests or fixtures, or expose it to the client
  (`VITE_*` variables are public).
- Tests must not hit the network. Use saved sample JSON (see `server/test/fixtures/`).
- Wire-protocol changes go through `/shared` with zod validation and tests on both ends. Bump
  `PROTOCOL_VERSION` for breaking changes.
- UI changes must stay keyboard-accessible, meet WCAG AA contrast, respect `prefers-reduced-motion`, and
  work at 360px wide.
