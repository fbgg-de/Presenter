/**
 * Presenter WebSocket Relay Server
 *
 * Each client must send an auth message as the first message after connecting:
 *   { "action": "auth", "account": <number> }
 *
 * Only authenticated clients are kept. Messages are relayed only to other
 * clients that share the same account number.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

const PORT = Number(process.env.PORT ?? 9001);

interface AuthedClient {
  ws: WebSocket;
  account: number;
  authTimer: ReturnType<typeof setTimeout> | null;
}

const clients = new Set<AuthedClient>();

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

  // Give the client 5 seconds to authenticate
  client.authTimer = setTimeout(() => {
    if (client.account === -1) {
      console.warn(`[WS Relay] Closing unauthenticated connection from ${ip}`);
      ws.close(4001, 'Authentication timeout');
    }
  }, 5000);

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
      if (msg.action !== 'auth' || typeof msg.account !== 'number') {
        ws.send(JSON.stringify({ type: 'error', error: 'First message must be auth: { action: "auth", account: <number> }' }));
        ws.close(4002, 'Authentication required');
        return;
      }

      if (client.authTimer) {
        clearTimeout(client.authTimer);
        client.authTimer = null;
      }

      client.account = msg.account as number;
      clients.add(client);

      const accountPeers = [...clients].filter((c) => c.account === client.account).length;
      ws.send(JSON.stringify({ type: 'auth_ok', account: client.account, count: accountPeers, others: Math.max(0, accountPeers - 1) }));
      // Notify all account peers (including this new client) of the updated count
      broadcastPeerCount(client.account);

      // Replay last known operator state so new clients don't start blank
      const cached = lastSyncPerAccount.get(client.account);
      if (cached) {
        try {
          ws.send(cached);
        } catch {
          /* ignore */
        }
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
