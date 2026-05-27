/**
 * useWsSync — Browser WebSocket client for musician sync mode.
 *
 * Connects to a shared WebSocket relay server (e.g. wss://ws.example.com),
 * authenticates with the account number, receives `musician_sync` messages
 * and fires navigation callbacks.
 */
import { useEffect, useRef, useState } from 'react';

export type WsSyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WsSyncState {
  activeItemIndex: number;
  activeBlockIndex: number;
  activeLineIndex: number;
  isBlack: boolean;
  songNumber?: number;
  songTitle?: string;
  showTitle?: string;
  orderName?: string;
  contentType?: string;
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

      setStatus('connecting');

      ws.onopen = () => {
        if (stopped) { ws.close(); return; }
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

      ws.onclose = () => {
        if (stopped) return;
        setStatus('disconnected');
        reconnectTimer = setTimeout(() => {
          if (!stopped) connect();
        }, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
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
  }, [url, account, enabled]);

  return { status };
};
