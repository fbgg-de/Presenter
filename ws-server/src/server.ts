/**
 * Presenter WebSocket Relay Server
 *
 * Each client must send an auth message as the first message after connecting.
 * Two auth modes are supported:
 *
 *   { "action": "auth", "account": <number> }          — direct account number
 *   { "action": "auth", "token":   "<hex64>" }         — viewer token (resolved
 *                                                          via BACKEND_URL)
 *
 * The auth message may carry an optional `client` descriptor
 * ({ role, mode, name }) describing what kind of client this is. It is relayed
 * back to every peer of the account in `peer_count`, so the operator can show
 * WHO is connected instead of just how many. Clients whose kind changes at
 * runtime (a musician switching sync mode) send { "action": "client_info",
 * "client": {…} } instead of reconnecting.
 *
 * Only authenticated clients are kept. Messages are relayed only to other
 * clients that share the same account number.
 *
 * Environment variables:
 *   PORT              — WebSocket listen port (default: 9001)
 *   BACKEND_URL       — Base URL of the PHP backend, e.g. https://presenter.example.com
 *                       Required for token-based auth.
 *   SYNC_TTL_SECONDS  — How long the cached selection stays current (default: 3600 = 1 h,
 *                       0 = never expire). See "Selection TTL" below.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

const PORT        = Number(process.env.PORT ?? 9001);
const BACKEND_URL = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');

/**
 * Selection TTL.
 *
 * The relay caches the last musician_sync per account so a client that connects mid-service
 * immediately sees the current position. Without an expiry that cache is effectively
 * permanent: a viewer screen left running would still show last Sunday's verse days later.
 *
 * So the cached selection is treated as CURRENT only for this long after the last update.
 * When it lapses the cache is dropped and every client of the account is told, which is the
 * viewer's cue to clear the text and say nothing is being presented. Any new sync restarts
 * the clock, so an active service never expires.
 *
 * A non-numeric or negative value falls back to the default; 0 disables expiry entirely.
 */
const DEFAULT_SYNC_TTL_SECONDS = 3600;
const rawTtl = Number(process.env.SYNC_TTL_SECONDS);
const SYNC_TTL_SECONDS = Number.isFinite(rawTtl) && rawTtl >= 0 ? rawTtl : DEFAULT_SYNC_TTL_SECONDS;
const SYNC_TTL_MS = SYNC_TTL_SECONDS * 1000;

/**
 * What a connected client is, as reported by the client itself. Purely descriptive —
 * the relay never routes on it, it only mirrors it back to the account's peers so the
 * operator footer can break the connection count down by kind.
 */
interface ClientInfo {
  /** 'unknown' covers clients from before this handshake existed. */
  role: 'operator' | 'musician' | 'remote' | 'viewer' | 'unknown';
  /** Musicians only: their current sync mode ('midi' | 'operator' | 'off'). */
  mode?: string;
  /** Optional display name (musician name), shown in the operator tooltip. */
  name?: string;
}

interface AuthedClient {
  ws: WebSocket;
  account: number;
  authTimer: ReturnType<typeof setTimeout> | null;
  info: ClientInfo;
}

const KNOWN_ROLES = new Set(['operator', 'musician', 'remote', 'viewer']);

/**
 * Normalize a client-supplied descriptor. Everything here comes off the wire, so an
 * unknown role, an over-long name or a non-object are all reduced to something safe
 * rather than rejected — the descriptor is cosmetic and must never fail a connection.
 */
function parseClientInfo(raw: unknown): ClientInfo {
  if (!raw || typeof raw !== 'object') return { role: 'unknown' };
  const obj = raw as Record<string, unknown>;
  const role = typeof obj.role === 'string' && KNOWN_ROLES.has(obj.role) ? (obj.role as ClientInfo['role']) : 'unknown';
  const info: ClientInfo = { role };
  if (typeof obj.mode === 'string' && obj.mode) info.mode = obj.mode.slice(0, 32);
  if (typeof obj.name === 'string' && obj.name.trim()) info.name = obj.name.trim().slice(0, 64);
  return info;
}

const clients = new Set<AuthedClient>();

/**
 * Close code sent to peers the operator kicked. In the application range (4000-4999) so
 * clients can tell it apart from a network drop: this one must NOT auto-reconnect.
 */
const WS_CLOSE_OPERATOR_DISCONNECT = 4010;

/**
 * Resolve a viewer token to an account number by calling the PHP backend.
 * Returns the account number on success, or null if the token is invalid.
 */
async function resolveToken(token: string): Promise<number | null> {
  if (!BACKEND_URL) {
    console.warn('[WS Relay] BACKEND_URL not set — token auth unavailable');
    return null;
  }
  const url = `${BACKEND_URL}/rest/ValidateToken?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[WS Relay] ValidateToken HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(body) as Record<string, unknown>;
    } catch {
      console.warn('[WS Relay] ValidateToken response is not JSON:', body.slice(0, 200));
      return null;
    }
    // Response::success() returns the array directly: { "account": 123 }
    const account = json?.account;
    if (typeof account !== 'number') {
      console.warn('[WS Relay] ValidateToken unexpected response shape:', JSON.stringify(json).slice(0, 200));
      return null;
    }
    console.log(`[WS Relay] Token resolved to account ${account}`);
    return account;
  } catch (err) {
    console.error('[WS Relay] Token validation request failed:', (err as Error).message, 'URL:', url);
    return null;
  }
}

/**
 * Last known musician_sync state per account.
 *
 * Replayed to new clients on auth so they immediately see the current position. The replay
 * is tagged `replay: true` because it is a CACHE, not a live broadcast: an operator that
 * reconnects would otherwise treat its own stale cached state as a musician telling it
 * where to go, and jump. Only clients that are meant to adopt a starting position act on it.
 *
 * Entries expire after SYNC_TTL_MS — see "Selection TTL" above.
 */
interface CachedSync {
  payload: string;
  /** When the operator last updated this selection. */
  at: number;
  /** Fires SYNC_TTL_MS after `at`; null when expiry is disabled. */
  timer: ReturnType<typeof setTimeout> | null;
}

const lastSyncPerAccount = new Map<number, CachedSync>();

/**
 * Re-serialize a cached sync payload with the replay marker and its age, so a client can
 * run its own expiry countdown from when the selection was made rather than from now.
 * Returns null if unusable.
 */
function taggedReplay(cached: CachedSync): string | null {
  try {
    const parsed = JSON.parse(cached.payload) as Record<string, unknown>;
    return JSON.stringify({ ...parsed, replay: true, ageMs: Date.now() - cached.at });
  } catch {
    return null;
  }
}

/** Send a message to every authenticated client of an account. */
function sendToAccount(account: number, message: Record<string, unknown>) {
  if (account === -1) return;
  const payload = JSON.stringify(message);
  for (const peer of clients) {
    if (peer.account !== account) continue;
    if (peer.ws.readyState !== WebSocket.OPEN) continue;
    try {
      peer.ws.send(payload);
    } catch {
      /* ignore — the close handler will clean this peer up */
    }
  }
}

/**
 * Drop an account's cached selection and tell its clients. Viewers clear their text;
 * every other client type ignores the message (they render from their own state).
 */
function expireSync(account: number) {
  const entry = lastSyncPerAccount.get(account);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  lastSyncPerAccount.delete(account);
  console.log(`[WS Relay] account=${account} selection expired after ${SYNC_TTL_SECONDS}s of no updates`);
  sendToAccount(account, { type: 'sync_expired', ttlSeconds: SYNC_TTL_SECONDS });
}

/** Cache a fresh selection and restart its expiry countdown. */
function cacheSync(account: number, payload: string) {
  const previous = lastSyncPerAccount.get(account);
  if (previous?.timer) clearTimeout(previous.timer);
  const entry: CachedSync = { payload, at: Date.now(), timer: null };
  if (SYNC_TTL_MS > 0) {
    entry.timer = setTimeout(() => expireSync(account), SYNC_TTL_MS);
    // Never hold the process open just to expire a cache entry.
    entry.timer.unref?.();
  }
  lastSyncPerAccount.set(account, entry);
}

/**
 * Send the current peer count for an account to all its authenticated clients.
 * `peers` lists the OTHER clients of the recipient, so it is built per recipient.
 */
function broadcastPeerCount(account: number) {
  if (account === -1) return;
  const peers = [...clients].filter((c) => c.account === account);
  for (const peer of peers) {
    if (peer.ws.readyState === 1 /* OPEN */) {
      peer.ws.send(
        JSON.stringify({
          type: 'peer_count',
          count: peers.length,
          others: Math.max(0, peers.length - 1),
          peers: peers.filter((p) => p !== peer).map((p) => p.info),
        }),
      );
    }
  }
}

const wss = new WebSocketServer({ port: PORT });

// Periodic ping — broadcast peer counts every 30 s so the operator footer stays current
const pingInterval = setInterval(() => {
  const accounts = new Set([...clients].map((c) => c.account));
  for (const account of accounts) {
    broadcastPeerCount(account);
  }
}, 30_000);

wss.on('listening', () => {
  console.log(`[WS Relay] Listening on port ${PORT}`);
  console.log(
    SYNC_TTL_SECONDS > 0
      ? `[WS Relay] Selection TTL: ${SYNC_TTL_SECONDS}s`
      : '[WS Relay] Selection TTL: disabled (SYNC_TTL_SECONDS=0)',
  );
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  console.log(`[WS Relay] New connection from ${ip}`);

  const client: AuthedClient = {
    ws,
    account: -1, // not yet authenticated
    authTimer: null,
    info: { role: 'unknown' },
  };

  // Give the client 10 seconds to authenticate (token validation involves an HTTP call)
  client.authTimer = setTimeout(() => {
    if (client.account === -1) {
      console.warn(`[WS Relay] Closing unauthenticated connection from ${ip}`);
      ws.close(4001, 'Authentication timeout');
    }
  }, 10000);

  ws.on('message', (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    // ── Auth handshake ──────────────────────────────────────────────────────
    if (client.account === -1) {
      if (msg.action !== 'auth') {
        ws.send(JSON.stringify({ type: 'error', error: 'First message must be an auth message.' }));
        ws.close(4002, 'Authentication required');
        return;
      }

      client.info = parseClientInfo(msg.client);

      const finishAuth = (account: number) => {
        if (client.authTimer) {
          clearTimeout(client.authTimer);
          client.authTimer = null;
        }
        client.account = account;
        clients.add(client);

        const accountPeers = [...clients].filter((c) => c.account === client.account);
        ws.send(
          JSON.stringify({
            type: 'auth_ok',
            account: client.account,
            count: accountPeers.length,
            others: Math.max(0, accountPeers.length - 1),
            peers: accountPeers.filter((p) => p !== client).map((p) => p.info),
            // Lets a client run the same expiry countdown locally, so it still clears its
            // display if this relay restarts (or never sends sync_expired) while it watches.
            syncTtlSeconds: SYNC_TTL_SECONDS,
          }),
        );
        broadcastPeerCount(client.account);

        const cached = lastSyncPerAccount.get(client.account);
        if (cached) {
          // Belt and braces next to the expiry timer: a suspended host (laptop lid, VM
          // snapshot) fires its timers late, so re-check the age before replaying.
          if (SYNC_TTL_MS > 0 && Date.now() - cached.at >= SYNC_TTL_MS) {
            expireSync(client.account);
          } else {
            const replay = taggedReplay(cached);
            if (replay) {
              try { ws.send(replay); } catch { /* ignore */ }
            }
          }
        }
      };

      // ── Token auth ────────────────────────────────────────────────────────
      if (typeof msg.token === 'string') {
        resolveToken(msg.token as string).then((account) => {
          if (account === null) {
            ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid or inactive viewer token.' }));
            ws.close(4003, 'Invalid token');
          } else {
            finishAuth(account);
          }
        });
        return;
      }

      // ── Direct account number auth ────────────────────────────────────────
      if (typeof msg.account !== 'number') {
        ws.send(JSON.stringify({ type: 'error', error: 'Provide account number or viewer token: { action: "auth", account: <number> } or { action: "auth", token: "<hex>" }' }));
        ws.close(4002, 'Authentication required');
        return;
      }

      finishAuth(msg.account as number);
      return;
    }

    // ── Client describes itself again (e.g. musician switched sync mode) ─────
    // Cheaper and less disruptive than reconnecting just to change the descriptor.
    if (msg.action === 'client_info') {
      client.info = parseClientInfo(msg.client);
      broadcastPeerCount(client.account);
      return;
    }

    // ── Operator: drop every other client of this account ────────────────────
    // Stale sockets accumulate (sleeping tablets, reloaded pages, dropped mobiles) and
    // there is no way to tell them apart from the server side. This lets the operator
    // clear the slate; peers see close code 4010, stop auto-reconnecting and offer a
    // manual reconnect instead, so nobody is silently cut off or instantly back.
    if (msg.action === 'disconnect_peers') {
      let closed = 0;
      for (const peer of [...clients]) {
        if (peer === client) continue;
        if (peer.account !== client.account) continue;
        peer.ws.close(WS_CLOSE_OPERATOR_DISCONNECT, 'Disconnected by operator');
        closed++;
      }
      console.log(`[WS Relay] account=${client.account} disconnected ${closed} peer(s) on operator request`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'peers_disconnected', count: closed }));
      }
      return;
    }

    // ── Relay to same-account peers ─────────────────────────────────────────
    const payload = data.toString();
    let relayed = 0;

    // Cache musician_sync so new clients can be replayed on auth. This also restarts the
    // selection's TTL, so an account that keeps presenting never expires.
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      if (parsed.action === 'musician_sync' && parsed.data) {
        cacheSync(client.account, payload);
      }
    } catch {
      /* ignore */
    }

    for (const peer of clients) {
      if (peer === client) continue;
      if (peer.account !== client.account) continue;
      if (peer.ws.readyState !== WebSocket.OPEN) continue;
      peer.ws.send(payload);
      relayed++;
    }

    // Optional: acknowledge relay
    // ws.send(JSON.stringify({ type: 'relayed', count: relayed }));
  });

  ws.on('close', () => {
    if (client.authTimer) clearTimeout(client.authTimer);
    clients.delete(client);
    console.log(`[WS Relay] Disconnected: account=${client.account} role=${client.info.role} ip=${ip} (total=${clients.size})`);
    // Notify remaining peers in the same account of the new count
    broadcastPeerCount(client.account);
  });

  ws.on('error', (err) => {
    console.error(`[WS Relay] Socket error (account=${client.account} ip=${ip}):`, err.message);
    if (client.authTimer) clearTimeout(client.authTimer);
    clients.delete(client);
  });
});

wss.on('error', (err) => {
  console.error('[WS Relay] Server error:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[WS Relay] SIGTERM received — shutting down');
  clearInterval(pingInterval);
  wss.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[WS Relay] SIGINT received — shutting down');
  clearInterval(pingInterval);
  wss.close(() => process.exit(0));
});
