/**
 * Relay ticket for the WebSocket relay's auth message.
 *
 * The relay no longer believes a bare account number — anyone can guess one. A signed-in
 * session fetches a signed ticket from /rest/WsTicket and sends it as `ticket`, next to
 * `account` so a relay older than tickets still lets it in.
 *
 * Tickets live a day and are cached here: reconnects reuse the cached ticket and only fetch a
 * new one in its second half, so a backend blip mid-service never blocks a reconnect.
 *
 * No Redux / settings import on purpose — the /control page uses this and stays tiny. Callers
 * pass the backend base URL (`getBackendBaseUrl()` in the app, '' on web-only pages).
 */

const REFRESH_BEFORE_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { ticket: string; expiresAt: number }>();

export async function relayTicket(base: string): Promise<string | undefined> {
  const cached = cache.get(base);
  if (cached && cached.expiresAt - Date.now() > REFRESH_BEFORE_MS) return cached.ticket;
  try {
    const res = await fetch(`${base}/rest/WsTicket`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const { ticket, expires } = (await res.json()) as { ticket?: unknown; expires?: unknown };
      if (typeof ticket === 'string' && typeof expires === 'number') cache.set(base, { ticket, expiresAt: expires * 1000 });
    }
  } catch {
    // Keep whatever is cached — still valid for hours.
  }
  const current = cache.get(base);
  return current && current.expiresAt > Date.now() ? current.ticket : undefined;
}

/** Send the relay auth message once the ticket is in hand (the relay allows 10 s for it). */
export function sendRelayAuth(ws: WebSocket, base: string, account: number, client?: object): void {
  void relayTicket(base).then((ticket) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'auth', account, ticket, client }));
  });
}
