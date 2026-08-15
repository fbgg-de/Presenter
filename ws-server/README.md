# Presenter WebSocket Relay Server

A small, standalone WebSocket relay server that routes real-time messages
between Presenter clients (operator + musician views) that belong to the
**same account**.

## Why a separate server?

The built-in WebSocket server in the Presenter Electron app runs over plain
`ws://` and cannot be wrapped with a valid TLS certificate. Modern browsers
block mixed-content connections (insecure `ws://` from an `https://` page).
Running this relay on a publicly reachable server behind a reverse proxy
solves the problem: clients connect via `wss://` with a real certificate.

---

## Authentication

Every client **must** send an auth message as the **very first** message after
the WebSocket connection is opened:

```json
{ "action": "auth", "account": 12345 }
```

- `account` is the integer account/license number the user is logged in with.
- The server confirms authentication with `{ "type": "auth_ok", "account": 12345 }`.
- Clients that do not authenticate within 5 seconds are disconnected.
- All subsequent messages from a client are relayed verbatim to every other
  client with the **same account number**.

---

## Setup

### 1. Build the TypeScript source

Run this once on your **development machine** (not inside Docker):

```bash
cd ws-server
npm install        # installs all dependencies incl. devDependencies for the build
npm run build      # compiles src/ → dist/
```

> **Important:** the `node_modules/` folder and the compiled `dist/` folder must
> both exist **before** running `docker compose up`. The Dockerfile copies them
> directly into the image — no `npm install` runs inside the container.
> This avoids DNS-related build failures that are common on Synology NAS and
> other environments with restricted Docker bridge networking.

### 2. Run with Docker Compose

```bash
sudo docker-compose up -d
```

By default the server listens on port **9001** inside the container.

> **Synology note:** if you still encounter `EAI_AGAIN` DNS errors, the
> `docker-compose.yml` already adds `dns: [1.1.1.1, 8.8.8.8]` as a fallback.
> Make sure the Synology firewall allows outbound UDP/TCP on port 53 from the
> Docker bridge network, or use the pre-built approach above.

For rebuilding the image after changes run:

```bash
sudo docker-compose down
sudo docker-compose build --no-cache
```

The relay prints its version on the first log line, so `docker-compose logs` tells you
which build is actually running:

```
[WS Relay] Presenter WebSocket relay v1.1.0 (node v22.19.0)
```

### 2b. Updating an existing deployment

Run `npm run deploy` from `ws-server/` on your development machine. It builds the
TypeScript, resolves production-only dependencies and packages both into two files:
`ws-server-deploy.zip` and `redeploy.sh`. Upload both into the folder that holds the
running deployment — the one with `docker-compose.yml` — and run:

```bash
sudo ./redeploy.sh
```

It stops the stack, removes `dist/`, `node_modules/`, `Dockerfile` and `package.json`,
unpacks the zip in their place, then rebuilds with `--no-cache` and starts again,
finishing by printing the startup log so you can confirm the version.

`docker-compose.yml` is never touched, and the zip does not contain one by default —
it holds this host's `BACKEND_URL`, published port and `SYNC_TTL_SECONDS`, which must
survive a redeploy. Build with `node scripts/deploy.js --with-compose` only when
bootstrapping a host that has no compose file yet.

The script verifies the zip, the compose file and `unzip` are all present *before* it
deletes anything, so a bad upload cannot leave you with a half-emptied folder. Pass
`-y` to skip the confirmation prompt.

### 3. Configure a reverse proxy (TLS termination)

Clients need `wss://`. The WS relay can share the **same hostname** as your PHP
app — just route it on a sub-path (e.g. `/ws`). This is the most common setup and
requires no extra domain or certificate.

#### nginx — same host, sub-path (recommended)

Add a `location /ws` block to your existing server block. The critical part is
the `Upgrade` / `Connection` headers that turn the HTTP request into a WebSocket
tunnel:

```nginx
# Inside your existing server { listen 443 ssl; server_name presenter.example.com; ... }

location /ws {
    proxy_pass         http://127.0.0.1:9001;   # ws-relay container port
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host       $host;
    proxy_read_timeout 3600s;   # keep long-lived WS connections alive
}
```

Then configure `config.php`:

```php
const WS_HOST = [
    'host' => 'presenter.example.com',  // same as your app
    'port' => 443,
    'path' => '/ws',                    // matches the nginx location above
    'wss'  => true,
];
```

> **Synology DSM reverse proxy**: in DSM → Application Portal → Reverse Proxy,
> add a rule for the `/ws` path on the same hostname, pointing to
> `http://localhost:9001`. Make sure "WebSocket" is enabled (DSM has a checkbox
> for upgrade headers).

#### nginx — separate sub-domain

If you prefer a dedicated domain (`ws.example.com`), omit `path` from `WS_HOST`:

```nginx
server {
    listen 443 ssl;
    server_name ws.example.com;

    ssl_certificate     /etc/letsencrypt/live/ws.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ws.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_read_timeout 3600s;
    }
}
```

```php
const WS_HOST = [
    'wss'  => true,
    'host' => 'ws.example.com',
    'port' => 443,
];
```

#### Caddy — automatic HTTPS

```
presenter.example.com {
    # PHP app
    root * /var/www/presenter
    php_fastcgi unix//run/php/php-fpm.sock

    # WebSocket relay on /ws path
    reverse_proxy /ws localhost:9001
}
```

### 4. Configure Presenter

In `config.php` on your Presenter server, set:

```php
const WS_HOST = [
    'host' => 'ws.example.com',
    'port' => 443,
    'wss'  => true,
];
```

All accounts that use the same Presenter backend will connect to this relay.
Messages are automatically isolated per account — operator and musician clients
belonging to account `12345` will never receive messages from account `67890`.

---

## Environment variables

| Variable           | Default | Description                                                 |
| ------------------ | ------- | ----------------------------------------------------------- |
| `PORT`             | `9001`  | TCP port the server listens on                              |
| `BACKEND_URL`      | –       | Base URL of the PHP backend; required for viewer-token auth |
| `SYNC_TTL_SECONDS` | `3600`  | How long the last selection stays current (`0` = forever)   |

### Selection TTL

The relay caches the last `musician_sync` per account so a client connecting mid-service
sees the current position immediately. `SYNC_TTL_SECONDS` bounds how long that cache counts
as **current** — one hour by default.

- Every new selection restarts the clock, so an active service never expires.
- When the TTL lapses the relay drops the cached selection and sends
  `{ type: "sync_expired" }` to every client of that account. The live viewer clears its
  text and shows that nothing is being presented.
- Clients connecting after expiry get no replay, so they start empty rather than showing a
  selection from days ago.
- Note that this measures time since the last **change**. A single block left up longer
  than the TTL expires too, even with the operator still connected — raise the value (or
  set `0`) if you intentionally hold one text for hours.

`auth_ok` carries `syncTtlSeconds` so clients can run the same countdown locally and still
clear their display if the relay restarts while they are watching.

---

## Protocol reference

### Client → Server

| Message                                             | When          | Description                                        |
| --------------------------------------------------- | ------------- | -------------------------------------------------- |
| `{ action: "auth", account: <number>, client?: {} }` | First message | Authenticate with an account number                |
| `{ action: "client_info", client: {} }`             | After auth    | Update this client's descriptor (no reconnect)     |
| `{ action: "disconnect_peers" }`                    | After auth    | Close every other client of the account (op. only) |
| Any JSON                                            | After auth    | Relayed to all peers with the same account         |

The optional `client` descriptor is `{ role, mode?, name? }` with `role` one of
`operator`, `musician`, `remote`, `viewer` (anything else becomes `unknown`),
`mode` a musician's sync mode (`midi`, `operator`, `off`) and `name` an optional
display name. It is never used for routing — the relay only mirrors it back to
the account's peers so the operator can see **what** is connected, not just how
many. Clients that omit it keep working and appear as `unknown`.

### Server → Client

| Message                                                            | Description                                         |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| `{ type: "auth_ok", account, count, others, peers: [], syncTtlSeconds }` | Authentication successful                      |
| `{ type: "peer_count", count, others, peers: [] }`                 | Peer count + descriptors changed (also every 30 s)  |
| `{ type: "peers_disconnected", count }`                            | Answer to `disconnect_peers`                        |
| `{ type: "sync_expired", ttlSeconds }`                             | The cached selection went stale — clear the display |
| `{ type: "error", error: "..." }`                                  | Protocol error                                      |

A replayed selection additionally carries `replay: true` and `ageMs` (how long ago it was
set), so a client can start its local expiry countdown from the right moment.

`peers` lists the descriptors of the recipient's **other** clients, so
`peers.length === others`.
