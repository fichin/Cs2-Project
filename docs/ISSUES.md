# Backlog: labels and issues

The GitHub CLI wasn't available when Phase 1 was published, so the backlog lives here, ready to be created
in one go. Each issue's full body (context, scope, acceptance criteria checklist) is in [`docs/issues/`](issues/).

## Create everything with one command

```bash
# 1. Install the GitHub CLI (Windows):
winget install --id GitHub.cli        # or: https://cli.github.com
# 2. Log in (opens a browser), then add the project scope for the board:
gh auth login --hostname github.com --git-protocol https --web
gh auth refresh -s project
# 3. From the repo root (Git Bash on Windows):
bash scripts/github-setup.sh fichin/Cs2-Project
```

The script is idempotent. It upserts labels, skips issues whose title already exists, creates the
**esports-live** project with the columns Backlog / In progress / In review / Done, and adds every issue to it.

## Labels

| Label | Color | Description |
| ----- | ----- | ----------- |
| `phase-2` | `#1d76db` | Phase 2: CS2 Game State Integration & reliability |
| `phase-3` | `#5319e7` | Phase 3: richer views (filters, details, brackets) |
| `phase-4` | `#0e8a16` | Phase 4: deployment, hardening & polish |
| `bug` | `#d73a4a` | Something isn't working |
| `enhancement` | `#a2eeef` | New feature or request |
| `docs` | `#0075ca` | Documentation |
| `testing` | `#fbca04` | Tests and test infrastructure |
| `a11y` | `#006b75` | Accessibility |
| `performance` | `#e99695` | Speed, bundle size, resource usage |
| `blocked` | `#b60205` | Blocked by an external dependency or decision |
| `good first issue` | `#7057ff` | Good for newcomers |

(Source: [`docs/issues/labels.tsv`](issues/labels.tsv))

## Issues

| # | Title | Labels | Body |
| - | ----- | ------ | ---- |
| 1 | GSI receiver: token-protected POST /gsi endpoint with zod validation | phase-2, enhancement | [01](issues/01-gsi-receiver.md) |
| 2 | Live player stats from GSI over WebSocket + "My match" panel | phase-2, enhancement | [02](issues/02-gsi-live-stats.md) |
| 3 | Derived stats from the GSI round stream (K/D, KPR, multi-kills, aces, clutches) | phase-2, enhancement, testing | [03](issues/03-gsi-derived-stats.md) |
| 4 | Multi-match view: filters (tournament, status) and match details page | phase-3, enhancement | [04](issues/04-multi-match-filters-details.md) |
| 5 | Tournament bracket view (free PandaScore data supports it) | phase-3, enhancement | [05](issues/05-tournament-bracket.md) |
| 6 | Deploy: server on Render, client on Vercel, origin config and README live demo | phase-4, enhancement, docs | [06](issues/06-deploy.md) |
| 7 | Optional access control and rate limiting for the GSI endpoint | phase-4, enhancement | [07](issues/07-gsi-access-control-rate-limit.md) |
| 8 | Detect silently dead WebSocket connections on the client (heartbeat + watchdog) | phase-2, bug, enhancement, testing | [08](issues/08-dead-websocket-detection.md) |
| 9 | Show map/round info when available, hide the fields cleanly otherwise | phase-3, enhancement, blocked | [09](issues/09-map-round-info.md) |
| 10 | Playwright e2e tests in CI (demo mode, live update, reconnect banner) | phase-2, testing | [10](issues/10-playwright-e2e.md) |
| 11 | Reduce client bundle size and add Lighthouse CI | phase-4, performance | [11](issues/11-bundle-size-lighthouse.md) |
| 12 | Add axe accessibility checks to the test suite | phase-2, a11y, testing | [12](issues/12-axe-a11y-tests.md) |
| 13 | README: add screenshots and a short demo GIF | phase-4, docs, good first issue | [13](issues/13-readme-screenshot-gif.md) |

(Source: [`docs/issues/manifest.tsv`](issues/manifest.tsv). The numbers above are the intended order; GitHub
assigns the real issue numbers on creation.)

## Phase placement notes

- Reliability and test infrastructure (dead-socket detection, Playwright, axe) go in **phase-2**, so later
  phases build on a safety net.
- Map/round info is **blocked** for PandaScore (paid real-time data). The fixture and GSI parts aren't blocked.
- The bracket issue already contains the free-plan investigation: `/tournaments/{id}/brackets` and `/standings`
  return 200 on the free plan, so it is feasible.
