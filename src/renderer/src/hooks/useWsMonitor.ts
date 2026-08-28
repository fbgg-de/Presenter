/**
 * useWsMonitor — admin-only client for the WebSocket relay's message tracer.
 *
 * Attaches to the relay as a `monitor`: a connection that never participates in relaying
 * and instead receives a copy of every message the relay sees, live, plus whatever is
 * already in its ring buffer. See ws-server/src/server.ts.
 *
 * Everything here is ephemeral. The relay holds traces in memory only and this hook holds
 * them in component state — closing the tab discards the session, and so does a relay
 * restart. Nothing is persisted anywhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsClientInfo } from './useWsSync';

/** One traced event, as filed by the relay. */
export interface WsTraceEntry {
  /** Relay-wide monotonic counter — the only reliable ordering across accounts. */
  seq: number;
  /** Epoch ms. */
  ts: number;
  /** -1 for events from a socket that never authenticated. */
  account: number;
  /** 'in' = client → relay, 'out' = relay → clients, 'sys' = connection lifecycle. */
  dir: 'in' | 'out' | 'sys';
  clientId: string;
  role: WsClientInfo['role'] | 'monitor' | 'unknown';
  name?: string;
  event: string;
  /** How many peers a relayed message reached. */
  peers?: number;
  bytes: number;
  payload?: string;
}

/** Live connection census for one account. */
export interface WsMonitorAccount {
  account: number;
  clients: Array<WsClientInfo | { role: string; mode?: string; name?: string }>;
  monitors: number;
}

export type WsMonitorStatus = 'idle' | 'connecting' | 'connected' | 'error';

/** What the component must supply to mint a fresh relay ticket. */
export type WsMonitorTicketFactory = () => Promise<{ url: string; token: string }>;

interface UseWsMonitorOptions {
  enabled: boolean;
  /** Account to watch, or null for every account. */
  account: number | null;
  getTicket: WsMonitorTicketFactory;
}

const RECONNECT_DELAY_MS = 3000;
/** Coalesce bursts into one render — a busy service can push many messages per second. */
const FLUSH_INTERVAL_MS = 200;

export const useWsMonitor = ({ enabled, account, getTicket }: UseWsMonitorOptions) => {
  const [status, setStatus] = useState<WsMonitorStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<WsTraceEntry[]>([]);
  const [accounts, setAccounts] = useState<WsMonitorAccount[]>([]);
  const [bufferSize, setBufferSizeState] = useState(500);
  const [limits, setLimits] = useState({ min: 50, max: 5000 });
  const [relayVersion, setRelayVersion] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  /** How many entries arrived while paused, so the button can say what resuming will show. */
  const [pendingCount, setPendingCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  /** The live list. Kept in a ref so a burst of messages costs one render, not one each. */
  const entriesRef = useRef<WsTraceEntry[]>([]);
  const dirtyRef = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const bufferSizeRef = useRef(bufferSize);
  bufferSizeRef.current = bufferSize;
  // Read inside the socket callbacks so neither identity re-opens the connection.
  const getTicketRef = useRef(getTicket);
  getTicketRef.current = getTicket;
  const accountRef = useRef(account);
  /** Bumped by reconnect() to re-run the connect effect on demand. */
  const [nonce, setNonce] = useState(0);

  const trim = (list: WsTraceEntry[]) => (list.length > bufferSizeRef.current ? list.slice(list.length - bufferSizeRef.current) : list);

  // ── Connect ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      if (stopped) return;
      setStatus('connecting');

      let ticket: { url: string; token: string };
      try {
        // A fresh ticket per attempt: monitor tokens expire within minutes and are spent
        // on the handshake, so a cached one would fail every reconnect after the first.
        ticket = await getTicketRef.current();
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
        scheduleReconnect();
        return;
      }

      if (stopped) return;

      try {
        ws = new WebSocket(ticket.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (stopped) {
          ws?.close();
          return;
        }
        ws?.send(
          JSON.stringify({
            action: 'auth',
            role: 'monitor',
            token: ticket.token,
            account: accountRef.current,
            client: { role: 'monitor' },
          }),
        );
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'monitor_ok': {
            setStatus('connected');
            setError(null);
            setRelayVersion(typeof msg.version === 'string' ? msg.version : null);
            if (typeof msg.bufferSize === 'number') {
              setBufferSizeState(msg.bufferSize);
              bufferSizeRef.current = msg.bufferSize;
            }
            if (msg.limits && typeof msg.limits === 'object') setLimits(msg.limits as { min: number; max: number });
            if (Array.isArray(msg.accounts)) setAccounts(msg.accounts as WsMonitorAccount[]);
            // The backlog replaces the view: it is the authoritative buffer for this scope,
            // and keeping older rows around would duplicate what it already contains.
            entriesRef.current = trim([...((msg.entries as WsTraceEntry[] | undefined) ?? [])]);
            dirtyRef.current = true;
            setPendingCount(0);
            return;
          }
          case 'trace': {
            const entry = msg.entry as WsTraceEntry | undefined;
            if (!entry) return;
            entriesRef.current = trim([...entriesRef.current, entry]);
            dirtyRef.current = true;
            if (pausedRef.current) setPendingCount((n) => n + 1);
            return;
          }
          case 'monitor_peers': {
            if (Array.isArray(msg.accounts)) setAccounts(msg.accounts as WsMonitorAccount[]);
            return;
          }
          case 'monitor_config': {
            if (typeof msg.bufferSize === 'number') {
              setBufferSizeState(msg.bufferSize);
              bufferSizeRef.current = msg.bufferSize;
              entriesRef.current = trim(entriesRef.current);
              dirtyRef.current = true;
            }
            return;
          }
          case 'monitor_cleared': {
            entriesRef.current = [];
            dirtyRef.current = true;
            setPendingCount(0);
            return;
          }
          case 'auth_error':
          case 'error': {
            setError(typeof msg.error === 'string' ? msg.error : 'Relay reported an error');
            return;
          }
          default:
        }
      };

      ws.onerror = () => {
        if (stopped) return;
        setStatus('error');
      };

      ws.onclose = () => {
        if (stopped) return;
        wsRef.current = null;
        setStatus('connecting');
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current = null;
      ws?.close();
      setStatus('idle');
    };
  }, [enabled, nonce]);

  // ── Flush the ref into state ──────────────────────────────────────────────
  // Paused freezes the *view*, not the stream: entries keep accumulating in the ref, so
  // resuming shows what happened while you were reading rather than a gap.
  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedRef.current || !dirtyRef.current) return;
      dirtyRef.current = false;
      setEntries(entriesRef.current);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!paused && dirtyRef.current) {
      dirtyRef.current = false;
      setEntries(entriesRef.current);
      setPendingCount(0);
    }
  }, [paused]);

  // ── Re-subscribe when the watched account changes ─────────────────────────
  useEffect(() => {
    accountRef.current = account;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // The relay answers with a fresh monitor_ok backlog for the new scope.
    ws.send(JSON.stringify({ action: 'monitor_subscribe', account }));
  }, [account]);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }, []);

  /** Resize the relay's ring buffer. Applies to every monitor and to what is already held. */
  const applyBufferSize = useCallback(
    (size: number) => {
      send({ action: 'monitor_config', bufferSize: size });
    },
    [send],
  );

  /** Drop the relay's buffer for the watched scope. Also clears every other monitor's view. */
  const clear = useCallback(() => {
    entriesRef.current = [];
    dirtyRef.current = true;
    setEntries([]);
    setPendingCount(0);
    send({ action: 'monitor_clear' });
  }, [send]);

  const reconnect = useCallback(() => setNonce((n) => n + 1), []);

  return {
    status,
    error,
    entries,
    accounts,
    bufferSize,
    limits,
    relayVersion,
    paused,
    setPaused,
    pendingCount,
    applyBufferSize,
    clear,
    reconnect,
  };
};
