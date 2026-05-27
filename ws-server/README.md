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

| Variable | Default | Description                    |
|----------|---------|--------------------------------|
| `PORT`   | `9001`  | TCP port the server listens on |

---

## Protocol reference

### Client → Server

| Message                                 | When          | Description                                |
|-----------------------------------------|---------------|--------------------------------------------|
| `{ action: "auth", account: <number> }` | First message | Authenticate with an account number        |
| Any JSON                                | After auth    | Relayed to all peers with the same account |

### Server → Client

| Message                                  | Description               |
|------------------------------------------|---------------------------|
| `{ type: "auth_ok", account: <number> }` | Authentication successful |
| `{ type: "error", error: "..." }`        | Protocol error            |

