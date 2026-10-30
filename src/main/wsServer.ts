/**
 * Built-in WebSocket server — Electron main process only (§22.2).
 * Provides real-time commands from Bitfocus Companion, remote control,
 * multi-client sync, and musician view synchronization.
 */
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import type { BrowserWindow } from 'electron';
import type { PresentationWindowManager } from './windows';
import type { WSCommand, WSResponse } from '../shared/types';

export class PresenterWebSocketServer {
  private wss: WSServer | null = null;
  /** The configured port; `port` is where the server actually listens (the next free one if taken). */
  private preferredPort: number;
  private port: number;
  /** Off: only this computer may connect. Anyone on the network could otherwise drive the screens. */
  private allowNetwork: boolean;
  private windowManager: PresentationWindowManager;
  private mainWindow: BrowserWindow | null = null;
  private clients: Set<WebSocket> = new Set();
  private commandHandlingEnabled = true;
  /** The renderer's last `state_update`, so `get_state` and a fresh connection get an answer at once. */
  private lastState: Record<string, unknown> | null = null;

  constructor(port: number, windowManager: PresentationWindowManager, allowNetwork = false) {
    this.preferredPort = this.port = port;
    this.allowNetwork = allowNetwork;
    this.windowManager = windowManager;
  }

  /**
   * Set reference to the main renderer window for dispatching actions.
   */
  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  /**
   * Start the WebSocket server.
   */
  start(): void {
    if (this.wss) {
      this.stop();
    }
    this.listen(this.preferredPort, 10);
  }

  private listen(port: number, retries: number): void {
    const wss = new WSServer({
      port,
      maxPayload: 1024 * 1024, // commands are tiny; ws defaults to 100 MiB

      host: this.allowNetwork ? undefined : '127.0.0.1',
      // Browsers always send an Origin; Companion and other tools never do. Without this any web
      // page open on this computer could connect and drive the presentation.
      verifyClient: ({ origin }) => !origin,
    });
    this.wss = wss;

    wss.on('listening', () => {
      this.port = port;
      console.log(`[WS Server] Started on ${this.allowNetwork ? 'all interfaces' : '127.0.0.1'}:${port}`);
    });

    wss.on('error', (err: NodeJS.ErrnoException) => {
      // A relay or another app often holds 9001 on a dev machine — take the next free port like
      // the media server does; the Companion dialog shows the one in use.
      if (err.code === 'EADDRINUSE' && retries > 0 && this.wss === wss) {
        console.warn(`[WS Server] Port ${port} in use, trying ${port + 1}`);
        wss.close();
        this.listen(port + 1, retries - 1);
        return;
      }
      console.error(`[WS Server] Error on port ${port}:`, err.message);
    });

    wss.on('connection', (ws) => {
      this.clients.add(ws);
      this.notifyClientCount();
      if (this.lastState)
        this.sendResponse(ws, {
          type: 'broadcast',
          action: 'state_update',
          success: true,
          data: { ...this.lastState, sentAt: Date.now() },
        });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as WSCommand;
          this.handleCommand(ws, message);
        } catch {
          this.sendResponse(ws, {
            type: 'response',
            action: 'error',
            success: false,
            error: 'Invalid JSON message',
          });
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.notifyClientCount();
      });

      ws.on('error', () => {
        this.clients.delete(ws);
        this.notifyClientCount();
      });
    });
  }

  /**
   * Stop the WebSocket server.
   */
  stop(onClosed?: () => void): void {
    if (this.wss) {
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();
      this.wss.close(() => onClosed?.());
      this.wss = null;
      console.log('[WS Server] Stopped');
    } else {
      onClosed?.();
    }
  }

  /** Accept other computers (remote Companion) or only this one. Restarts the server. */
  setAllowNetwork(allow: boolean): void {
    if (allow === this.allowNetwork) return;
    this.allowNetwork = allow;
    // Re-listen only once the port is released, or it would hop to the next one.
    if (this.wss) this.stop(() => this.start());
  }

  allowsNetwork(): boolean {
    return this.allowNetwork;
  }

  /** Return current number of connected WS clients. */
  getClientCount(): number {
    return this.clients.size;
  }

  /** Return the port the server listens on. */
  getPort(): number {
    return this.port;
  }

  /** Return whether incoming companion commands are currently applied. */
  isCommandHandlingEnabled(): boolean {
    return this.commandHandlingEnabled;
  }

  /** Enable/disable applying incoming companion commands. */
  setCommandHandlingEnabled(enabled: boolean): void {
    this.commandHandlingEnabled = enabled;
  }

  /** Send client count update to the main renderer window. */
  private notifyClientCount(): void {
    this.sendToRenderer('ws-client-count', { count: this.clients.size });
  }

  /**
   * Broadcast a state_update to all connected clients.
   * Called from the renderer (via IPC) after every navigation action.
   */
  broadcastStateUpdate(data: Record<string, unknown>): void {
    this.lastState = data;
    this.broadcast('state_update', data);
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcast(action: string, data?: Record<string, unknown>): void {
    const message: WSResponse = {
      type: 'broadcast',
      action,
      success: true,
      data,
    };
    const payload = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Handle an incoming WebSocket command.
   */
  private handleCommand(ws: WebSocket, command: WSCommand): void {
    const { id, action, target, payload } = command;

    this.sendToRenderer('ws-last-command', {
      action,
      target,
      payload,
      receivedAt: Date.now(),
    });

    const queryOnlyActions = new Set(['get_state', 'get_windows']);
    if (!this.commandHandlingEnabled && !queryOnlyActions.has(action)) {
      this.sendResponse(ws, {
        id,
        type: 'response',
        action,
        success: false,
        error: 'Companion command handling is disabled',
      });
      return;
    }

    try {
      switch (action) {
        // ── Navigation (delegated to renderer) ──
        case 'next_item':
        case 'prev_item':
        case 'next_block':
        case 'prev_block':
        case 'next_line':
        case 'prev_line':
        case 'set_item':
        case 'set_block':
        case 'set_line':
        case 'toggle_text':
        case 'set_text_hidden':
        case 'take':
        case 'set_mode':
        case 'toggle_background':
        case 'toggle_media_layer':
        case 'toggle_stage_overlays':
        case 'stage':
          this.sendToRenderer('ws-navigation-action', { action, payload });
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        // ── Window actions ──
        case 'fade_to_black':
          this.windowManager.fadeToBlack(target);
          this.sendToRenderer('ws-navigation-action', { action: 'set_black', payload: { value: true, target } });
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          this.broadcast('fade_to_black', { target });
          break;

        case 'fade_from_black':
          this.windowManager.fadeFromBlack(target);
          this.sendToRenderer('ws-navigation-action', { action: 'set_black', payload: { value: false, target } });
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          this.broadcast('fade_from_black', { target });
          break;

        case 'toggle_black':
          this.sendToRenderer('ws-navigation-action', { action: 'toggle_black', payload: { target } });
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        case 'freeze_window':
          if (target) {
            this.windowManager.freezeWindow(target);
            this.sendToRenderer('ws-navigation-action', { action: 'freeze_window', payload: { windowName: target } });
            this.sendResponse(ws, { id, type: 'response', action, success: true });
            this.broadcast('freeze_window', { target });
          } else {
            this.sendResponse(ws, { id, type: 'response', action, success: false, error: 'Target window name required' });
          }
          break;

        case 'unfreeze_window':
          if (target) {
            this.windowManager.unfreezeWindow(target);
            this.sendToRenderer('ws-navigation-action', { action: 'unfreeze_window', payload: { windowName: target } });
            this.sendResponse(ws, { id, type: 'response', action, success: true });
            this.broadcast('unfreeze_window', { target });
          } else {
            this.sendResponse(ws, { id, type: 'response', action, success: false, error: 'Target window name required' });
          }
          break;

        case 'identify_windows':
          this.windowManager.identifyWindows();
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        case 'set_display_mode':
          if (!target) {
            this.sendResponse(ws, { id, type: 'response', action, success: false, error: 'Target window name required' });
            break;
          }

          if (payload?.mode !== 'normal' && payload?.mode !== 'stream') {
            this.sendResponse(ws, { id, type: 'response', action, success: false, error: 'Payload mode must be "normal" or "stream"' });
            break;
          }

          {
            const states = this.windowManager.getWindowStates();
            const matching = states.filter((state) => state.name === target);

            if (matching.length === 0) {
              this.sendResponse(ws, { id, type: 'response', action, success: false, error: `No window found for target: ${target}` });
              break;
            }

            matching.forEach((state) => {
              this.windowManager.updateWindowConfig(state.id, { displayMode: payload.mode as 'normal' | 'stream' });
            });

            this.sendResponse(ws, { id, type: 'response', action, success: true, data: { updated: matching.length } });
          }
          break;

        // ── Video controls (delegated to renderer) ──
        case 'video_play':
        case 'video_pause':
        case 'video_toggle':
        case 'video_rate':
        case 'master_speed':
        case 'video_stop':
        case 'video_seek':
          this.sendToRenderer('ws-video-action', { action, target, payload });
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        // ── State queries ──
        case 'get_state':
          // Answered from the renderer's last broadcast — nothing in the renderer listens for a request.
          this.sendResponse(ws, {
            id,
            type: 'response',
            action,
            success: this.lastState !== null,
            data: this.lastState ? { ...this.lastState, sentAt: Date.now() } : undefined,
          });
          break;

        case 'get_windows': {
          const states = this.windowManager.getWindowStates();
          this.sendResponse(ws, {
            id,
            type: 'response',
            action,
            success: true,
            data: { windows: states },
          });
          break;
        }

        // ── Musician sync (broadcast to all clients) ──
        case 'musician_sync':
          this.broadcast('musician_sync', payload);
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        case 'musician_pdf_updated':
          this.broadcast('musician_pdf_updated', payload);
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        case 'midi_event':
          this.broadcast('midi_event', payload);
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        default:
          this.sendResponse(ws, {
            id,
            type: 'response',
            action,
            success: false,
            error: `Unknown action: ${action}`,
          });
      }
    } catch (err) {
      this.sendResponse(ws, {
        id,
        type: 'response',
        action,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Send a command to the main renderer window via IPC.
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Send a response to a specific WebSocket client.
   */
  private sendResponse(ws: WebSocket, response: WSResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }
}
