import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { PresentationWindowManager } from './windows';
import { registerIpcHandlers } from './ipc';
import { PresenterWebSocketServer } from './wsServer';
import { LocalMediaServer } from './mediaServer';
import iconIco from '../../favicon.ico?asset';
import iconPng from '../../favicon.svg?asset';
import iconSvg from '../../favicon.svg?asset';

// ── Simple file-based window bounds persistence (replaces Config.ts) ──
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const boundsFile = join(app.getPath('userData'), 'window-bounds.json');
// Sidecar file mirroring `presenter_media_path` from renderer localStorage so
// that the media server can be started BEFORE the renderer has finished
// loading. Without this the very first /list request from MediaBrowser races
// the server start and fails with ERR_CONNECTION_REFUSED.
const mediaPathFile = join(app.getPath('userData'), 'media-path.json');

function loadPersistedMediaPath(): string {
  try {
    if (existsSync(mediaPathFile)) {
      const raw = JSON.parse(readFileSync(mediaPathFile, 'utf-8')) as { path?: string };
      return typeof raw.path === 'string' ? raw.path : '';
    }
  } catch {
    /* ignore */
  }
  return '';
}

function savePersistedMediaPath(mediaPath: string): void {
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(mediaPathFile, JSON.stringify({ path: mediaPath }), 'utf-8');
  } catch {
    /* ignore */
  }
}

interface WindowBoundsData {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

function loadWindowBounds(): WindowBoundsData {
  try {
    if (existsSync(boundsFile)) {
      return JSON.parse(readFileSync(boundsFile, 'utf-8'));
    }
  } catch {
    /* ignore */
  }
  return { width: 450, height: 750 };
}

function saveWindowBounds(bounds: WindowBoundsData): void {
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(boundsFile, JSON.stringify(bounds), 'utf-8');
  } catch {
    /* ignore */
  }
}

// ── Single instance lock ──
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ── Module instances ──
const windowManager = new PresentationWindowManager();
let wsServer: PresenterWebSocketServer | null = null;
let mediaServer: LocalMediaServer | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  let icon: string | undefined;
  if (process.platform === 'win32') {
    icon = iconIco;
  } else if (process.platform === 'darwin') {
    icon = iconPng;
  } else {
    icon = iconSvg;
  }

  const bounds = loadWindowBounds();

  mainWindow = new BrowserWindow({
    show: false,
    frame: true,
    autoHideMenuBar: true,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    fullscreen: false,
    transparent: false,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      devTools: true,
      // Prevent Chromium from throttling timers/rAF when the controller window
      // is occluded by a fullscreen presentation window — without this, the
      // controller's own UI freezes for hundreds of ms while keys auto-repeat.
      backgroundThrottling: false,
    },
    ...(bounds.isMaximized ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : bounds),
    minWidth: 600,
    minHeight: 400,
  });

  let persistEnabled = false;
  const persistBounds = (): void => {
    if (!mainWindow || !persistEnabled) return;
    const isMaximized = mainWindow.isMaximized();
    if (isMaximized) {
      // Only update the maximized flag, keep the last normal bounds
      const prev = loadWindowBounds();
      saveWindowBounds({ ...prev, isMaximized: true });
    } else {
      const b = mainWindow.getBounds();
      saveWindowBounds({ x: b.x, y: b.y, width: b.width, height: b.height, isMaximized: false });
    }
  };
  mainWindow.on('move', persistBounds);
  mainWindow.on('resize', persistBounds);
  mainWindow.on('close', () => {
    persistBounds();
    // Destroy any presentation/musician windows so the app can fully quit.
    // Without this, secondary windows remain open and 'window-all-closed' never fires.
    try {
      windowManager.destroyAll();
    } catch (err) {
      console.error('[Main] Failed to destroy presentation windows on main close:', err);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Ensure the app actually quits on platforms other than macOS.
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  mainWindow.on('ready-to-show', () => {
    if (bounds.isMaximized) {
      mainWindow!.maximize();
    }
    mainWindow!.show();
    // Enable bounds persistence after initial layout is complete
    setTimeout(() => { persistEnabled = true; }, 500);
    if (is.dev) {
      mainWindow!.webContents.openDevTools();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Set the main window reference for WebSocket server
  if (wsServer) {
    wsServer.setMainWindow(mainWindow);
  }
  // Set the main window reference for window bounds notifications
  windowManager.setMainWindow(mainWindow);

  // Auto-start media server after renderer finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    autoStartMediaServer();
  });

  // HMR for renderer based on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ── Register all IPC handlers ──
registerIpcHandlers(windowManager);

// IPC handler for media server URL
ipcMain.handle('get-media-server-url', () => {
  return mediaServer?.getBaseUrl() || '';
});

// Auto-start media server when main window finishes loading and a media path is configured
function autoStartMediaServer(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`localStorage.getItem('presenter_media_path') || ''`)
    .then(async (mediaPath: string) => {
      if (mediaPath) {
        try {
          if (mediaServer) {
            await mediaServer.updatePath(mediaPath);
          } else {
            mediaServer = new LocalMediaServer(mediaPath);
            await mediaServer.start(9100);
          }
          // Mirror to sidecar file for next launch's pre-start.
          savePersistedMediaPath(mediaPath);
          console.log('[Media Server] Auto-started for path:', mediaPath);
        } catch (err) {
          console.error('[Media Server] Auto-start failed:', err);
        }
      }
    })
    .catch(() => {});
}

// IPC handler for WebSocket broadcast (from renderer to WS clients)
ipcMain.on('ws-broadcast', (_event, action: string, data?: Record<string, unknown>) => {
  wsServer?.broadcast(action, data);
});

// IPC handler for WS state response (from renderer back to WS clients)
ipcMain.on('ws-state-response', (_event, data: unknown) => {
  console.log('[WS] State response from renderer:', data);
});

// ── Auto Update Logic ──
// Auto-check setting is read from renderer localStorage via IPC after window loads
if (app.isPackaged) {
  autoUpdater.on('update-downloaded', ({ version, releaseDate, releaseNotes, releaseName }) => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update Available',
        message:
          (process.platform === 'win32'
            ? Array.isArray(releaseNotes)
              ? releaseNotes.map((note) => note.toString()).join('\n')
              : releaseNotes
            : releaseName) ?? '',
        detail: `A new version (${version}, ${releaseDate}) has been downloaded. Restart the application to apply the updates.`,
      })
      .then((returnValue) => returnValue.response === 0 && autoUpdater.quitAndInstall());
  });

  autoUpdater.on('error', (message) => {
    console.error('There was a problem updating the application');
    console.error(message);
  });
}

// ── App lifecycle ──
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Create the main window
  createWindow();

  // Check for auto-update preference from renderer localStorage after window loads
  if (app.isPackaged && mainWindow) {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        const autoCheck = await mainWindow!.webContents.executeJavaScript(
          `localStorage.getItem('presenter_auto_check_updates') !== 'false'`,
        );
        if (autoCheck) {
          setTimeout(() => autoUpdater.checkForUpdates(), 8000);
        }
      } catch {
        /* ignore */
      }
    });
  }

  // ── Start WebSocket server (§22.2) ──
  try {
    // Default port; the renderer can update it via IPC if needed
    const wsPort = 9001;
    wsServer = new PresenterWebSocketServer(wsPort, windowManager);
    wsServer.start();
    if (mainWindow) {
      wsServer.setMainWindow(mainWindow);
    }
  } catch (err) {
    console.error('[WS Server] Failed to start:', err);
  }

  // ── Start local media server (§7.2) ──
  // Pre-start from sidecar BEFORE the renderer asks. This eliminates the
  // race where MediaBrowser's first `/list` fetch hits ERR_CONNECTION_REFUSED
  // because the server hasn't been started yet.
  const persistedMediaPath = loadPersistedMediaPath();
  if (persistedMediaPath) {
    try {
      mediaServer = new LocalMediaServer(persistedMediaPath);
      await mediaServer.start(9100);
      console.log('[Media Server] Pre-started from sidecar for path:', persistedMediaPath);
    } catch (err) {
      console.error('[Media Server] Pre-start failed:', err);
      mediaServer = null;
    }
  }

  // Mutex flag to prevent concurrent start-media-server calls racing on updatePath.
  let mediaServerStarting = false;
  ipcMain.handle('start-media-server', async (_event, mediaPath: string) => {
    if (!mediaPath) return '';
    // Idempotency: if already running with the same resolved path, just return the URL.
    const { resolve: resolvePath } = await import('path');
    if (mediaServer && mediaServer.getMediaPath() === resolvePath(mediaPath) && mediaServer.getPort() > 0) {
      return mediaServer.getBaseUrl();
    }
    // Serialize concurrent calls to avoid stop/start races.
    if (mediaServerStarting) return mediaServer?.getBaseUrl() ?? '';
    mediaServerStarting = true;
    try {
      if (mediaServer) {
        await mediaServer.updatePath(mediaPath);
      } else {
        mediaServer = new LocalMediaServer(mediaPath);
        await mediaServer.start(9100);
      }
      // Mirror to sidecar so the next launch can pre-start.
      savePersistedMediaPath(mediaPath);
      return mediaServer.getBaseUrl();
    } catch (err) {
      console.error('[Media Server] Failed to start:', err);
      return '';
    } finally {
      mediaServerStarting = false;
    }
  });

  // Handle second-instance (single instance lock)
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  // Clean up servers
  wsServer?.stop();
  mediaServer?.stop();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure all child windows are destroyed before quit
app.on('before-quit', () => {
  windowManager.destroyAll();
});

