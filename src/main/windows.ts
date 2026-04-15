/**
 * Presentation Window Manager — Electron main process.
 * Creates, tracks, and controls presentation BrowserWindows (§7.2, §12, §13).
 */
import { BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { WindowConfig, WindowState, ScreenInfo, MusicianViewConfig, PresentationContentIPC } from '../shared/types';

interface ManagedWindow {
  id: string;
  config: WindowConfig;
  browserWindow: BrowserWindow;
  frozen: boolean;
  isBlack: boolean;
  queuedContent: PresentationContentIPC | null; // content queued while frozen
}

let windowCounter = 0;

export class PresentationWindowManager {
  private windows: Map<string, ManagedWindow> = new Map();
  private musicianWindows: Map<string, BrowserWindow> = new Map();

  /**
   * Create a new presentation window.
   */
  createPresentationWindow(config: WindowConfig): string {
    const id = `pres-${++windowCounter}`;

    const win = new BrowserWindow({
      x: config.positionX,
      y: config.positionY,
      width: config.width || 1920,
      height: config.height || 1080,
      fullscreen: config.fullscreen,
      frame: !config.frameless,
      alwaysOnTop: config.alwaysOnTop,
      transparent: config.streamTransparentBg || false,
      hasShadow: !config.streamTransparentBg,
      skipTaskbar: true,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/presentation.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: is.dev,
      },
    });

    // Hide mouse cursor if configured
    if (config.hideMouse) {
      win.webContents.on('did-finish-load', () => {
        win.webContents.insertCSS('* { cursor: none !important; }');
      });
    }

    // Build URL with query params for display mode config
    const queryParams = new URLSearchParams();
    queryParams.set('mode', config.displayMode || 'normal');
    if (config.name) queryParams.set('name', config.name);
    if (config.streamLines) queryParams.set('lines', String(config.streamLines));
    if (config.languages && config.languages !== 'all') {
      queryParams.set('languages', config.languages);
    }
    if (config.streamTransparentBg) {
      queryParams.set('transparent', '1');
    }

    const queryString = queryParams.toString();

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const baseUrl = process.env['ELECTRON_RENDERER_URL'];
      win.loadURL(`${baseUrl}/presentation.html?${queryString}`);
    } else {
      win.loadFile(join(__dirname, '../renderer/presentation.html'), {
        search: queryString,
      });
    }

    win.once('ready-to-show', () => {
      win.show();
      if (config.fullscreen) {
        win.setFullScreen(true);
      }
    });

    win.on('closed', () => {
      this.windows.delete(id);
    });

    const managed: ManagedWindow = {
      id,
      config,
      browserWindow: win,
      frozen: config.frozen || false,
      isBlack: false,
      queuedContent: null,
    };

    this.windows.set(id, managed);
    return id;
  }

  /**
   * Close a specific presentation window.
   */
  closePresentationWindow(id: string): void {
    const managed = this.windows.get(id);
    if (managed && !managed.browserWindow.isDestroyed()) {
      managed.browserWindow.close();
    }
    this.windows.delete(id);
  }

  /**
   * Close all presentation windows.
   */
  closeAll(): void {
    for (const [, managed] of this.windows) {
      if (!managed.browserWindow.isDestroyed()) {
        managed.browserWindow.close();
      }
    }
    this.windows.clear();
  }

  /**
   * Send content to a specific presentation window.
   * Respects freeze state — queues content if frozen.
   */
  updatePresentationContent(id: string, content: PresentationContentIPC): void {
    const managed = this.windows.get(id);
    if (!managed || managed.browserWindow.isDestroyed()) return;

    if (managed.frozen) {
      managed.queuedContent = content;
      return;
    }

    this._sendContent(managed, content);
  }

  /**
   * Broadcast content to all presentation windows.
   * Per-window config overrides (displayMode, languages, etc.) are applied.
   */
  broadcastContent(content: PresentationContentIPC): void {
    for (const [, managed] of this.windows) {
      if (managed.browserWindow.isDestroyed()) continue;

      // Apply per-window config overrides
      const windowContent: PresentationContentIPC = {
        ...content,
        displayMode: managed.config.displayMode || content.displayMode,
        languages: managed.config.languages !== 'all' ? managed.config.languages.split(',').map((l) => l.trim()) : content.languages,
        streamLines: managed.config.streamLines || content.streamLines,
        hideText: managed.config.hideText || content.hideText,
        hideBackground: managed.config.hideBackground || content.hideBackground,
        windowName: managed.config.name || content.windowName,
      };

      if (managed.frozen) {
        managed.queuedContent = windowContent;
      } else {
        this._sendContent(managed, windowContent);
      }
    }
  }

  /**
   * Fade to black by window name. If no name provided, affects all.
   */
  fadeToBlack(windowName?: string): void {
    this._forEachByName(windowName, (managed) => {
      managed.isBlack = true;
      if (!managed.browserWindow.isDestroyed()) {
        managed.browserWindow.webContents.send('presentation-command', {
          type: 'FADE_TO_BLACK',
        });
      }
    });
  }

  /**
   * Fade from black by window name. If no name provided, affects all.
   */
  fadeFromBlack(windowName?: string): void {
    this._forEachByName(windowName, (managed) => {
      managed.isBlack = false;
      if (!managed.browserWindow.isDestroyed()) {
        managed.browserWindow.webContents.send('presentation-command', {
          type: 'FADE_FROM_BLACK',
        });
      }
    });
  }

  /**
   * Freeze a window by name — queues content updates.
   */
  freezeWindow(windowName: string): void {
    this._forEachByName(windowName, (managed) => {
      managed.frozen = true;
    });
  }

  /**
   * Unfreeze a window by name — applies latest queued content.
   */
  unfreezeWindow(windowName: string): void {
    this._forEachByName(windowName, (managed) => {
      managed.frozen = false;
      if (managed.queuedContent) {
        this._sendContent(managed, managed.queuedContent);
        managed.queuedContent = null;
      }
    });
  }

  /**
   * Trigger all presentation windows to show identification overlay.
   */
  identifyWindows(): void {
    let counter = 1;
    for (const [, managed] of this.windows) {
      if (managed.browserWindow.isDestroyed()) continue;
      managed.browserWindow.webContents.send('presentation-command', {
        type: 'IDENTIFY',
        windowName: managed.config.name || `Window ${managed.id}`,
        number: counter++,
      });

      // Auto-hide after 3 seconds
      const win = managed.browserWindow;
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.webContents.send('presentation-command', {
            type: 'HIDE_IDENTIFY',
          });
        }
      }, 3000);
    }
  }

  /**
   * Get states of all open windows.
   */
  getWindowStates(): WindowState[] {
    const states: WindowState[] = [];
    for (const [, managed] of this.windows) {
      if (managed.browserWindow.isDestroyed()) continue;
      const bounds = managed.browserWindow.getBounds();
      states.push({
        id: managed.id,
        name: managed.config.name,
        displayMode: managed.config.displayMode,
        frozen: managed.frozen,
        isBlack: managed.isBlack,
        bounds,
      });
    }
    return states;
  }

  /**
   * List all available screens/displays.
   */
  listScreens(): ScreenInfo[] {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    return displays.map((d) => ({
      id: d.id,
      label: d.label || `Display ${d.id}`,
      bounds: d.bounds,
      workArea: d.workArea,
      isPrimary: d.id === primary.id,
      scaleFactor: d.scaleFactor,
    }));
  }

  /**
   * Open the musician PDF view as a separate BrowserWindow.
   */
  openMusicianView(config: MusicianViewConfig): string {
    const id = `musician-${++windowCounter}`;

    const win = new BrowserWindow({
      width: config.width || 1024,
      height: config.height || 768,
      x: config.positionX,
      y: config.positionY,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html#/notes`);
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/notes',
      });
    }

    win.on('closed', () => {
      this.musicianWindows.delete(id);
    });

    this.musicianWindows.set(id, win);
    return id;
  }

  /**
   * Get a specific window's BrowserWindow instance.
   */
  getWindow(id: string): BrowserWindow | null {
    const managed = this.windows.get(id);
    return managed?.browserWindow || null;
  }

  /**
   * Get all managed windows (for external iteration).
   */
  getAllWindows(): Map<string, ManagedWindow> {
    return this.windows;
  }

  // ── Private helpers ──

  private _sendContent(managed: ManagedWindow, content: PresentationContentIPC): void {
    if (!managed.browserWindow.isDestroyed()) {
      managed.browserWindow.webContents.send('presentation-update', {
        type: 'UPDATE_PRESENTATION',
        props: { content },
      });
    }
  }

  private _forEachByName(windowName: string | undefined, callback: (managed: ManagedWindow) => void): void {
    for (const [, managed] of this.windows) {
      if (managed.browserWindow.isDestroyed()) continue;
      if (!windowName || managed.config.name === windowName) {
        callback(managed);
      }
    }
  }
}
