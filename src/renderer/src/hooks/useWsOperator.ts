/**
 * useWsOperator — connects the operator (presenter) to the WebSocket relay
 * server and exposes a `broadcast` function to relay messages to all musician
 * clients that share the same account.
 *
 * The relay server expects every client to authenticate first:
 *   { action: "auth", account: <number> }
 * After that, any message sent by this client is forwarded to every other
 * client with the same account number.
 */
import { useEffect, useRef, useCallback, useState } from 'react';

const RECONNECT_DELAY_MS = 5000;

export interface WsOperatorIncomingSync {
  activeItemIndex?: number;
  activeBlockIndex?: number;
  activeLineIndex?: number;
  songNumber?: number;
  songTitle?: string;
  orderName?: string;
  contentType?: string;
}

export const useWsOperator = (
  url: string,
  account: number | null,
  onMusicianSync?: (state: WsOperatorIncomingSync) => void,
  onGetState?: () => void,
) => {
  const wsRef = useRef<WebSocket | null>(null);
  const authedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [lastMidiSyncAt, setLastMidiSyncAt] = useState<number>(0);
  const onMusicianSyncRef = useRef(onMusicianSync);
  onMusicianSyncRef.current = onMusicianSync;
  const onGetStateRef = useRef(onGetState);
  onGetStateRef.current = onGetState;

  useEffect(() => {
    if (!url || account == null) {
      setConnected(false);
      setConnectedCount(0);
      return;
    }

    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        return;
      }

      wsRef.current = ws;
      authedRef.current = false;

      ws.onopen = () => {
        if (stopped) {
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ action: 'auth', account }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          if (msg.type === 'auth_ok') {
            authedRef.current = true;
            setConnected(true);
            if (typeof msg.others === 'number') {
              setConnectedCount(msg.others);
            } else if (typeof msg.count === 'number') {
              setConnectedCount(Math.max(0, msg.count - 1));
            }
          } else if (msg.type === 'peer_count') {
            if (typeof msg.others === 'number') {
              setConnectedCount(msg.others);
            } else if (typeof msg.count === 'number') {
              // Backward compatibility: older relays send count including this client.
              setConnectedCount(Math.max(0, msg.count - 1));
            }
          } else if (msg.action === 'musician_sync' && msg.data) {
            // A musician is broadcasting their current position — record the timestamp
            setLastMidiSyncAt(Date.now());
            onMusicianSyncRef.current?.(msg.data as WsOperatorIncomingSync);
          } else if (msg.action === 'get_state') {
            // A new musician client is requesting the current state — re-broadcast immediately
            onGetStateRef.current?.();
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        // reconnect is handled by onclose
      };

      ws.onclose = () => {
        if (stopped) return;
        authedRef.current = false;
        setConnected(false);
        setConnectedCount(0);
        setLastMidiSyncAt(0);
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      authedRef.current = false;
      setConnected(false);
      setConnectedCount(0);
      setLastMidiSyncAt(0);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, account]);

  const broadcast = useCallback((action: string, data?: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authedRef.current) return;
    ws.send(JSON.stringify({ type: 'broadcast', action, data }));
  }, []);

  return { connected, connectedCount, lastMidiSyncAt, broadcast };
};
