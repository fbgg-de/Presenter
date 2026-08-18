# test/ws-sync/

Integration test for the WebSocket relay and the sync protocol spoken over it.

It boots the **real** relay (`ws-server/src/server.ts`, started through ts-node so the test
always runs the current source) and drives a service's worth of clients against it: an
operator in MIDI-follow mode, musicians in each sync mode, text viewers and a mobile
remote. Each scenario then asserts what every client ended up displaying.

```bash
npm run test:ws
```

```bash
node test/ws-sync/run.mjs --verbose
```

```bash
node test/ws-sync/run.mjs 3 4
```

`--verbose` streams the relay's own log alongside the checks. Bare numbers select
scenarios by their printed number. Exit code is non-zero if any check fails.

Scenarios share one relay and are isolated by account number (the relay routes and caches
per account), so a leaked client or a stale cache in one cannot reach another. The expiry
scenario gets a second relay because `SYNC_TTL_SECONDS` is process-wide.

## What is real and what is modelled

| Piece                                                 | In this test                           |
| ----------------------------------------------------- | -------------------------------------- |
| Relay (`ws-server/src/server.ts`)                     | **the real thing**, as a child process |
| Wire protocol, message shapes, ordering, timing       | **real** — messages cross real sockets |
| Operator, musician, viewer, remote clients            | **ports** in `clients.mjs`             |
| Rendering, React scheduling, Electron IPC, MIDI input | not covered                            |

The clients are ports because the real ones are React hooks, an Electron renderer and a
PHP-rendered page that cannot all be booted headlessly at once. Every port names the
source file and line range it mirrors, in a comment above the class and again on the
non-obvious branches. **When you change one of those files, change the port to match** —
a port that has drifted asserts the old behaviour and will pass while the app is broken.

The ports are worth having because the failures this suite is for are not rendering
failures. They are messages that one client sends and another cannot handle, which shows
up in the payload shapes and the state machines — both of which are copied here
field-for-field.

## What it caught

The bug this was written for: a MIDI musician broadcasts a **bare position report**
(`activeItemIndex` / `activeBlockIndex` / `activeLineIndex` / `songNumber`) on the same
`musician_sync` action the operator uses for the **full presentation state** (song title,
block name, lyrics, `isBlack`, …). The text viewer rendered both, so every musician move
cleared the lyrics, wiped song and block from the info bar and dropped the black overlay.

Usually the operator's next broadcast repaired it within milliseconds and it read as a
flicker. It became permanent whenever the operator had nothing to re-broadcast — the
musician re-selecting the block already showing, or the operator not in MIDI-follow mode —
because the broadcast is deduplicated on content and an unchanged state sends nothing.
The relay also cached position reports, so the next viewer to connect was replayed a
state with no song in it.

Fixed by teaching the viewer and the relay's cache to tell the two apart (`contentType` is
present only on the operator's payload) — `viewer/index.php` and
`ws-server/src/server.ts`. Scenarios 3, 4, 5 and 7 cover it.

## Adding a scenario

Append a `scenario(name, description, fn)` call in `run.mjs`. The function receives
`{ url, ttlUrl, account }` and should:

1. build clients from `clients.mjs` and `await client.connect()`,
2. `await quiesce(clients)` after every action — it waits for the message cascade to go
   quiet rather than sleeping a fixed amount,
3. assert with `report.equal` / `report.check`, and use `report.note` for observations
   worth printing but not worth failing on,
4. close every client it opened.

`quiesce` measures silence from the moment it is called, never from the last message, so
it cannot return before a round trip it was meant to wait for.
