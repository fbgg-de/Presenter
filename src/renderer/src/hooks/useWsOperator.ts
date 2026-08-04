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
import { WS_CLOSE_OPERATOR_DISCONNECT } from './useWsSync';

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
  onRemoteCommand?: (data: Record<string, unknown>) => void,
) => {
  const wsRef = useRef<WebSocket | null>(null);
  const authedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  /** True after the operator cleared the connected clients — no auto-retry until asked. */
  const [droppedByOperator, setDroppedByOperator] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  /**
   * Relay's answer to a `disconnect_peers` request: how many peers it closed, and when.
   * Its absence is meaningful too — a relay that predates the feature never answers, so
   * the caller can tell "nothing to disconnect" from "the relay didn't understand me".
   */
  const [lastPeersDisconnected, setLastPeersDisconnected] = useState<{ count: number; at: number } | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);
  const [lastMidiSyncAt, setLastMidiSyncAt] = useState<number>(0);
  const onMusicianSyncRef = useRef(onMusicianSync);
  onMusicianSyncRef.current = onMusicianSync;
  const onGetStateRef = useRef(onGetState);
  onGetStateRef.current = onGetState;
  const onRemoteCommandRef = useRef(onRemoteCommand);
  onRemoteCommandRef.current = onRemoteCommand;

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
            // `replay` marks the relay's cached last state, sent to every client on auth.
            // It is not a musician telling us anything — following it would snap the
            // operator to a stale position every time this socket reconnects (and sockets
            // churn exactly when other devices are connecting).
            if (msg.replay) return;
            // A musician is broadcasting their current position — record the timestamp
            setLastMidiSyncAt(Date.now());
            onMusicianSyncRef.current?.(msg.data as WsOperatorIncomingSync);
          } else if (msg.action === 'get_state') {
            // A new musician client is requesting the current state — re-broadcast immediately
            onGetStateRef.current?.();
          } else if (msg.type === 'peers_disconnected') {
            setLastPeersDisconnected({ count: typeof msg.count === 'number' ? msg.count : 0, at: Date.now() });
          } else if (msg.action === 'remote_command' && msg.data) {
            // A remote-control client (mobile control page) sent a navigation command
            onRemoteCommandRef.current?.(msg.data as Record<string, unknown>);
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        // reconnect is handled by onclose
      };

      ws.onclose = (event) => {
        if (stopped) return;
        authedRef.current = false;
        setConnected(false);
        setConnectedCount(0);
        setLastMidiSyncAt(0);
        wsRef.current = null;
        // Cleared by the operator — retrying immediately would defeat the purpose.
        if (event.code === WS_CLOSE_OPERATOR_DISCONNECT) {
          stopped = true;
          setDroppedByOperator(true);
          return;
        }
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
  }, [url, account, reconnectNonce]);

  const broadcast = useCallback((action: string, data?: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authedRef.current) return;
    ws.send(JSON.stringify({ type: 'broadcast', action, data }));
  }, []);

  /** Re-open after the operator dropped us — the one close that does not retry on its own. */
  const reconnect = useCallback(() => {
    setDroppedByOperator(false);
    setReconnectNonce((n) => n + 1);
  }, []);

  return { connected, connectedCount, lastMidiSyncAt, broadcast, droppedByOperator, reconnect, lastPeersDisconnected };
};
