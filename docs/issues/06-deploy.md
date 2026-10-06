## Context

Make the app publicly reachable: server on **Render** (free web service), client on **Vercel**.

## Scope

- Render: web service from this repo, build `npm ci && npm run build -w server`, start `npm start`, health check path `/health`. Env vars: `PANDASCORE_TOKEN` (secret, set in the Render dashboard only), `ALLOWED_ORIGIN=https://<vercel-domain>`, `TRUST_PROXY=true`, `POLL_INTERVAL_MS=30000`. Consider a `render.yaml` blueprint **without** secret values.
- Vercel: project rooted at `client/`, build `npm run build`, output `dist`, env `VITE_WS_URL=wss://<render-service>.onrender.com/ws`.
- Origin/CORS: `ALLOWED_ORIGIN` lists the production domain (and optionally preview domains). Check that the WebSocket `Origin` check works behind Render's proxy.
- Free-tier sleep: confirm the client's "server is waking up" message shows on cold start. Document the expected 30–60 s first load.
- README: live demo link, CI badge, deploy instructions.

## Acceptance criteria

- [ ] Server deployed on Render; `/health` reachable; logs contain no secrets
- [ ] Client deployed on Vercel and connects over `wss://`
- [ ] Only the production origin(s) can open the WebSocket (verified with a disallowed origin → 403)
- [ ] `TRUST_PROXY=true` makes per-IP limits use the real client IP (verified)
- [ ] Cold start shows the waking-up message, then live data
- [ ] README has the live demo link, CI status badge and deploy steps; no secrets in the repo
