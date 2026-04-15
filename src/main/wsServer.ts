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
  private port: number;
  private windowManager: PresentationWindowManager;
  private mainWindow: BrowserWindow | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor(port: number, windowManager: PresentationWindowManager) {
    this.port = port;
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

    this.wss = new WSServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

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
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (err) => {
      console.error(`[WS Server] Error on port ${this.port}:`, err.message);
    });

    console.log(`[WS Server] Started on port ${this.port}`);
  }

  /**
   * Stop the WebSocket server.
   */
  stop(): void {
    if (this.wss) {
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
      console.log('[WS Server] Stopped');
    }
  }

  /**
   * Restart with a new port.
   */
  restart(port: number): void {
    this.port = port;
    this.stop();
    this.start();
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
          // TODO: Update window config dynamically
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        // ── Video controls (delegated to renderer) ──
        case 'video_play':
        case 'video_pause':
        case 'video_stop':
        case 'video_seek':
          this.sendToRenderer('ws-video-action', { action, target, payload });
          this.sendResponse(ws, { id, type: 'response', action, success: true });
          break;

        // ── State queries ──
        case 'get_state':
          // Request current state from renderer
          this.sendToRenderer('ws-get-state', { requestId: id });
          // The renderer will respond via IPC, which triggers a WS response
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
