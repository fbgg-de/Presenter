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
 * Only authenticated clients are kept. Messages are relayed only to other
 * clients that share the same account number.
 *
 * Environment variables:
 *   PORT         — WebSocket listen port (default: 9001)
 *   BACKEND_URL  — Base URL of the PHP backend, e.g. https://presenter.example.com
 *                  Required for token-based auth.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

const PORT        = Number(process.env.PORT ?? 9001);
const BACKEND_URL = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');

interface AuthedClient {
  ws: WebSocket;
  account: number;
  authTimer: ReturnType<typeof setTimeout> | null;
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
 * Replayed to new clients on auth so they immediately see current operator position.
 */
const lastSyncPerAccount = new Map<number, string>();

/** Send the current peer count for an account to all its authenticated clients. */
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
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  console.log(`[WS Relay] New connection from ${ip}`);

  const client: AuthedClient = {
    ws,
    account: -1, // not yet authenticated
    authTimer: null,
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

      const finishAuth = (account: number) => {
        if (client.authTimer) {
          clearTimeout(client.authTimer);
          client.authTimer = null;
        }
        client.account = account;
        clients.add(client);

        const accountPeers = [...clients].filter((c) => c.account === client.account).length;
        ws.send(JSON.stringify({ type: 'auth_ok', account: client.account, count: accountPeers, others: Math.max(0, accountPeers - 1) }));
        broadcastPeerCount(client.account);

        const cached = lastSyncPerAccount.get(client.account);
        if (cached) {
          try { ws.send(cached); } catch { /* ignore */ }
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

    // Cache musician_sync so new clients can be replayed on auth
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      if (parsed.action === 'musician_sync' && parsed.data) {
        lastSyncPerAccount.set(client.account, payload);
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
    console.log(`[WS Relay] Disconnected: account=${client.account} ip=${ip} (total=${clients.size})`);
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
