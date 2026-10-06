## Context

Once the server is public (deploy issue), the GSI endpoint and HTTP routes need protection beyond the shared GSI token.

## Scope

- Per-IP rate limiting for `POST /gsi` (e.g. token bucket, ~10 req/s burst, matching CS2's throttle/buffer settings) and a looser limit for `/health`. Return 429 with `Retry-After`.
- Optional allow-list: `GSI_ALLOWED_IPS` (comma-separated). Unset means any IP that has the token.
- Optional **per-user GSI tokens** (several players can stream to one server) stored as hashed values in env/config. Each token maps to a display name that shows up in the "My match" panel.
- Lockout/backoff after repeated bad tokens from one IP; logged without the attempted token.
- Make the option `GSI_ENABLED=false` a hard off switch.

## Acceptance criteria

- [ ] Rate limiter unit-tested (fake clock) and applied to `/gsi` and `/health`
- [ ] IP allow-list and multi-token support are optional and documented in README + `.env.example`
- [ ] Repeated bad tokens lead to temporary 429s; attempted tokens are never logged (test)
- [ ] Works correctly behind Render's proxy (`TRUST_PROXY`)
