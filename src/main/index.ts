import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { networkInterfaces } from 'os';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { PresentationWindowManager } from './windows';
import { registerIpcHandlers } from './ipc';
import { LocalMediaServer } from './mediaServer';
import { PresenterWebSocketServer } from './wsServer';
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

const loadPersistedMediaPath = () => {
  try {
    if (existsSync(mediaPathFile)) {
      const raw = JSON.parse(readFileSync(mediaPathFile, 'utf-8')) as { path?: string };
      return typeof raw.path === 'string' ? raw.path : '';
    }
  } catch {
    /* ignore */
  }
  return '';
};

const savePersistedMediaPath = (mediaPath: string) => {
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(mediaPathFile, JSON.stringify({ path: mediaPath }), 'utf-8');
  } catch {
    /* ignore */
  }
};

interface WindowBoundsData {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

const loadWindowBounds: () => WindowBoundsData = () => {
  try {
    if (existsSync(boundsFile)) {
      return JSON.parse(readFileSync(boundsFile, 'utf-8'));
    }
  } catch {
    /* ignore */
  }
  return { width: 450, height: 750 };
};

const saveWindowBounds = (bounds: WindowBoundsData) => {
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(boundsFile, JSON.stringify(bounds), 'utf-8');
  } catch {
    /* ignore */
  }
};

// ── Single instance lock ──
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// ── Module instances ──
const windowManager = new PresentationWindowManager();
let mediaServer: LocalMediaServer | null = null;
let mainWindow: BrowserWindow | null = null;
let backendOrigin = '';
const wsServer = new PresenterWebSocketServer(9001, windowManager);

const getWsHosts = (): string[] => {
  const nets = networkInterfaces();
  const hosts = new Set<string>(['127.0.0.1', 'localhost']);

  Object.values(nets).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry && entry.family === 'IPv4' && !entry.internal) {
        hosts.add(entry.address);
      }
    });
  });

  return Array.from(hosts);
};

const createWindow = () => {
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
    setTimeout(() => {
      persistEnabled = true;
    }, 500);
    if (is.dev) {
      mainWindow!.webContents.openDevTools();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const HTML_PATHS: Record<'/' | '/notes' | '/admin' | '/login', string> = {
    '/': join(__dirname, '../renderer/index.html'),
    '/notes': join(__dirname, '../renderer/musician.html'),
    '/admin': join(__dirname, '../renderer/admin.html'),
    '/login': join(__dirname, '../renderer/login.html'),
  };

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      event.preventDefault();
      return;
    }

    // Detect OIDC callback: URL is on the backend domain AND has a `code` param
    const backendHost = backendOrigin ? new URL(backendOrigin).host : null;
    const isCallbackFromBackend = backendHost && parsed.host === backendHost;
    const hasCode = parsed.searchParams.has('code');

    if (isCallbackFromBackend && hasCode) {
      // Block the navigation — perform the code exchange in a hidden window
      event.preventDefault();

      const htmlFile = HTML_PATHS[parsed.pathname as keyof typeof HTML_PATHS] ?? HTML_PATHS['/'];

      const exchangeWin = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });

      exchangeWin.webContents.on('did-finish-load', () => {
        mainWindow!.loadFile(htmlFile);
        exchangeWin.destroy();
      });

      exchangeWin.webContents.on('did-fail-load', (_e, errCode, errDesc) => {
        console.error('[OIDC] Exchange failed:', errCode, errDesc);
        mainWindow!.loadFile(HTML_PATHS['/login']);
        exchangeWin.destroy();
      });

      exchangeWin.loadURL(url);
      return;
    }

    // Navigation to the IdP (OIDC provider) — allow it to happen inside the window
    // so the provider can redirect the callback back to us via will-navigate.
    if (isCallbackFromBackend && !hasCode) {
      // A backend URL without a code is a normal server redirect — allow it
      return;
    }

    // Anything else that isn't the backend (e.g. IdP login page, user-clicked links):
    // Allow IdP navigation to proceed inside the window so the OIDC flow completes.
    // We distinguish IdP (navigated programmatically) from user-clicked links by
    // checking whether it's a top-level navigation from a file:// page.
    // Since we can't easily tell, we allow all non-file navigations that don't
    // originate from a user click on an anchor. The setWindowOpenHandler already
    // blocks new-window opens; will-navigate only fires for same-window navigations,
    // which are always programmatic (window.location.assign) in our app.
    // So: allow all same-window external navigations (they are all OIDC flows).
  });

  // Set the main window reference for window bounds notifications
  windowManager.setMainWindow(mainWindow);
  wsServer.setMainWindow(mainWindow);
  wsServer.start();

  // Auto-start media server after renderer finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    autoStartMediaServer();
  });

  // HMR for renderer based on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(HTML_PATHS['/']);
  }
};

// ── Register all IPC handlers ──
registerIpcHandlers(windowManager);

// IPC handler for media server URL
ipcMain.handle('get-media-server-url', () => {
  return mediaServer?.getBaseUrl() || '';
});

ipcMain.handle('get-ws-server-info', () => {
  return {
    hosts: getWsHosts(),
    port: wsServer.getPort(),
    clientCount: wsServer.getClientCount(),
    commandHandlingEnabled: wsServer.isCommandHandlingEnabled(),
  };
});

ipcMain.handle('set-ws-command-handling-enabled', (_event, enabled: boolean) => {
  wsServer.setCommandHandlingEnabled(Boolean(enabled));
  return wsServer.isCommandHandlingEnabled();
});

// Renderer pushes current state after executing a navigation command
ipcMain.on('ws-broadcast-state', (_event, data: Record<string, unknown>) => {
  wsServer.broadcastStateUpdate(data);
});

// Renderer reports the configured backend URL so will-navigate can identify callbacks
ipcMain.on('set-backend-origin', (_event, origin: string) => {
  backendOrigin = origin;
});

// Auto-start media server when main window finishes loading and a media path is configured
const autoStartMediaServer = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `
      (() => {
        const getSettings = (key) => {
          const SETTINGS_KEY = 'presenter_settings';
          try {
            const v = localStorage.getItem(SETTINGS_KEY);
            const settings = v ? JSON.parse(v) : {};
            return key ? settings[key] : settings;
          } catch {
            return key ? undefined : {};
          }
        };
        return getSettings('mediaPath') || '';
      })()
    `,
    )
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
};

// ── Auto Update Logic ──
// Auto-check setting is read from renderer localStorage via IPC after window loads
if (app.isPackaged) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    mainWindow?.webContents.send('updater-update-available', { version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater-update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater-download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', ({ version, releaseDate, releaseNotes, releaseName }) => {
    console.log('[Updater] Update downloaded:', version);
    mainWindow?.webContents.send('updater-update-downloaded', { version, releaseDate });
    // Also show native dialog as fallback
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
      .then((returnValue) => returnValue.response === 0 && autoUpdater.quitAndInstall(false, true));
  });

  autoUpdater.on('error', (message) => {
    console.error('There was a problem updating the application');
    console.error(message);
    mainWindow?.webContents.send('updater-error', { message: message?.message ?? String(message) });
  });
}

// ── App lifecycle ──
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // In production, F12 still opens DevTools for debugging purposes
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
    if (app.isPackaged) {
      window.webContents.on('before-input-event', (_event, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') {
          if (window.webContents.isDevToolsOpened()) {
            window.webContents.closeDevTools();
          } else {
            window.webContents.openDevTools({ mode: 'detach' });
          }
        }
      });
    }
  });

  // Create the main window
  createWindow();
  if (app.isPackaged && mainWindow) {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        const autoCheck = await mainWindow!.webContents.executeJavaScript(
          `
          (() => {
            const getSettings = (key) => {
              const SETTINGS_KEY = 'presenter_settings';
              try {
                const v = localStorage.getItem(SETTINGS_KEY);
                const settings = v ? JSON.parse(v) : {};
                return key ? settings[key] : settings;
              } catch {
                return key ? undefined : {};
              }
            };
            const val = getSettings('autoCheckUpdates');
            return val !== false && val !== 'false';
          })()
          `,
        );
        if (autoCheck) {
          setTimeout(() => autoUpdater.checkForUpdates(), 8000);
        }
      } catch {
        /* ignore */
      }
    });
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

      // Also ensure it is saved in renderer settings if not already (consistency)
      // Note: we can't easily write to localStorage from here, but the renderer
      // usually calls this AFTER setting its own state.

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  // Clean up servers
  mediaServer?.stop();
  wsServer.stop();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure all child windows are destroyed before quit
app.on('before-quit', () => {
  wsServer.stop();
  windowManager.destroyAll();
});
