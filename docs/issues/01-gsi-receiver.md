## Context

CS2 can push the local player's live game state to an HTTP endpoint via Valve's
[Game State Integration (GSI)](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration).
This gives real-time round data for **my own client**, which PandaScore's free plan can't provide (see README → Data sources).

## Scope

- `POST /gsi` on the server, accepting GSI JSON payloads.
- Authenticated with the `auth.token` value that CS2 includes in every payload (from the `.cfg` file), compared in constant time against a new `GSI_TOKEN` env var. Reject with 401 when it is missing or wrong, and never log the token (reuse the existing redactor).
- Validate payloads with zod (lenient: GSI omits sections depending on game state). Discard unknown fields.
- Body size limit (e.g. 64 KB) and JSON content type only.
- `docs/gamestate_integration_esportslive.cfg` sample (uri, timeout, buffer, throttle, heartbeat, `auth.token` placeholder, data sections: provider, map, round, player_id, player_state, player_match_stats, allplayers_* where available).
- README section **"Enable CS2 Game State Integration"**: where to put the cfg (`.../Counter-Strike Global Offensive/game/csgo/cfg/`), how to set the token, and how to verify with `/health`.

## Acceptance criteria

- [ ] `POST /gsi` returns 200 for a valid payload with the right token and 401 for a wrong/missing token
- [ ] Payloads are validated with zod; invalid ones return 400 without crashing the server
- [ ] `GSI_TOKEN` added to `server/.env.example` (empty) and documented; the endpoint is disabled (404) when it is unset
- [ ] Token comparison uses `crypto.timingSafeEqual`; the token never appears in logs (test)
- [ ] Sample `docs/gamestate_integration_esportslive.cfg` committed with a placeholder token
- [ ] README section explains setup end to end
- [ ] Unit tests with recorded sample payloads (no real game needed in CI)
