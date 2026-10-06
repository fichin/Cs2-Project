## Context

The server terminates dead clients via ping/pong, but **browsers can't see WebSocket ping frames**. If the connection dies silently (laptop sleep, a NAT/proxy dropping idle TCP, Render restarts behind a proxy), the client may keep showing "Live" with frozen data until the OS notices, which can take minutes. This was noted as unfinished in the Phase 1 report.

## Proposed solution

- Server sends an application-level heartbeat message (e.g. `{ type: "heartbeat", v, serverTime }`) every ~20–25 s. This also keeps proxies from closing idle connections.
- Client watchdog: if **no message of any kind** arrives for N seconds (e.g. 2.5 × heartbeat interval), close the socket and enter the normal reconnect flow (status "reconnecting").
- Optionally use the heartbeat's `serverTime` to show clock-skew-safe "last update" times.

## Acceptance criteria

- [ ] `heartbeat` message type in `/shared` with validation and tests (protocol version handled)
- [ ] Server broadcasts heartbeats on a configurable interval (`HEARTBEAT_MS`)
- [ ] Client watchdog reconnects after N seconds of silence (fake-timer test with `FakeWebSocket`)
- [ ] No reconnect while messages keep flowing (test)
- [ ] README protocol table updated
