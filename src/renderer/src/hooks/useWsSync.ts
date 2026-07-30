/**
 * useWsSync — Browser WebSocket client for musician sync mode.
 *
 * Connects to a shared WebSocket relay server (e.g. wss://ws.example.com),
 * authenticates with the account number, receives `musician_sync` messages
 * and fires navigation callbacks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type WsSyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'dropped_by_operator';

/** Close code the relay uses when the operator clears the connected clients. */
export const WS_CLOSE_OPERATOR_DISCONNECT = 4010;

export interface WsSyncState {
  /**
   * Identifies the client that produced this state. Musician pages tag their own
   * broadcasts with it so they can drop the relay's echo — a musician in MIDI mode
   * holds two sockets (this one to receive, a `useWsOperator` one to send) and the
   * relay only excludes the *sending* socket, not the other socket of the same page.
   */
  clientId?: string;
  activeItemIndex: number;
  activeBlockIndex: number;
  activeLineIndex: number;
  isBlack: boolean;
  songNumber?: number;
  songTitle?: string;
  showTitle?: string;
  orderName?: string;
  contentType?: string;
  blockName?: string;
  blockLines?: Array<{ text: string; language?: string }>;
}

interface UseWsSyncOptions {
  url: string; // e.g. "wss://ws.example.com"
  account: number | null;
  enabled: boolean;
  onStateUpdate?: (state: WsSyncState) => void;
}

const RECONNECT_DELAY_MS = 3000;

export const useWsSync = ({ url, account, enabled, onStateUpdate }: UseWsSyncOptions) => {
  const [status, setStatus] = useState<WsSyncStatus>('disconnected');
  const onStateUpdateRef = useRef(onStateUpdate);
  onStateUpdateRef.current = onStateUpdate;
  // The live socket, so callers can send on the connection this hook already owns instead
  // of opening a second one (which the relay would also count as an extra peer).
  const wsRef = useRef<WebSocket | null>(null);
  const authedRef = useRef(false);
  // Bumped by reconnect() to re-run the connect effect after the operator dropped us.
  const [reconnectNonce, setReconnectNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !url || account == null) {
      setStatus('disconnected');
      return;
    }

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        console.error('[WsSync] WebSocket constructor threw:', err);
        setStatus('error');
        return;
      }

      wsRef.current = ws;
      authedRef.current = false;
      setStatus('connecting');

      ws.onopen = () => {
        if (stopped) {
          ws.close();
          return;
        }
        setStatus('connecting');
        try {
          ws.send(JSON.stringify({ action: 'auth', account }));
        } catch (err) {
          console.warn('[WsSync] failed to send auth:', err);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'auth_ok') {
            authedRef.current = true;
            setStatus('connected');
            // Request current state from the operator
            try {
              ws.send(JSON.stringify({ action: 'get_state', id: 'init' }));
            } catch (err) {
              console.warn('[WsSync] failed to send get_state:', err);
            }
            return;
          }
          if (msg.action === 'musician_sync' && onStateUpdateRef.current) {
            onStateUpdateRef.current(msg.data as WsSyncState);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = (e) => {
        console.warn('[WsSync] WebSocket error', e);
        if (!stopped) setStatus('error');
      };

      ws.onclose = (event) => {
        if (stopped) return;
        authedRef.current = false;
        // The operator deliberately cleared the connected clients — reconnecting on a timer
        // would put us straight back and make the button useless. Wait for the user.
        if (event.code === WS_CLOSE_OPERATOR_DISCONNECT) {
          stopped = true;
          setStatus('dropped_by_operator');
          return;
        }
        setStatus('disconnected');
        reconnectTimer = setTimeout(() => {
          if (!stopped) connect();
        }, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
      authedRef.current = false;
      wsRef.current = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      setStatus('disconnected');
    };
  }, [url, account, enabled, reconnectNonce]);

  /** Re-open after the operator dropped us (the only case that does not retry on its own). */
  const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);

  /**
   * Relay a message to the account's other peers over this same connection.
   * Returns false when the socket is not connected/authenticated yet.
   */
  const broadcast = useCallback((action: string, data?: Record<string, unknown>): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authedRef.current) return false;
    ws.send(JSON.stringify({ type: 'broadcast', action, data }));
    return true;
  }, []);

  return { status, broadcast, reconnect };
};
