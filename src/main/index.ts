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

function loadWindowBounds(): { x?: number; y?: number; width: number; height: number } {
  try {
    if (existsSync(boundsFile)) {
      return JSON.parse(readFileSync(boundsFile, 'utf-8'));
    }
  } catch {
    /* ignore */
  }
  return { width: 450, height: 750 };
}

function saveWindowBounds(bounds: { x: number; y: number; width: number; height: number }): void {
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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      devTools: true,
    },
    ...bounds,
    minWidth: 600,
    minHeight: 400,
  });

  const persistBounds = (): void => {
    if (!mainWindow) return;
    const b = mainWindow.getBounds();
    saveWindowBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  };
  mainWindow.on('move', persistBounds);
  mainWindow.on('resize', persistBounds);
  mainWindow.on('close', persistBounds);

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Set the main window reference for WebSocket server
  if (wsServer) {
    wsServer.setMainWindow(mainWindow);
  }

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
  ipcMain.handle('start-media-server', async (_event, mediaPath: string) => {
    if (mediaPath) {
      try {
        if (mediaServer) {
          await mediaServer.updatePath(mediaPath);
        } else {
          mediaServer = new LocalMediaServer(mediaPath);
          await mediaServer.start();
        }
        return mediaServer.getBaseUrl();
      } catch (err) {
        console.error('[Media Server] Failed to start:', err);
        return '';
      }
    }
    return '';
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
