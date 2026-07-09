import { app, shell, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { networkInterfaces } from 'os';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { PresentationWindowManager } from './windows';
import { registerIpcHandlers } from './ipc';
import { LocalMediaServer } from './mediaServer';
import { PresenterWebSocketServer } from './wsServer';
import { getCredentials } from './credentials';
import iconIco from '../../favicon.ico?asset';
import iconPng from '../../favicon.svg?asset';
import iconSvg from '../../favicon.svg?asset';

// ── Simple file-based window bounds persistence (replaces Config.ts) ──
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const boundsFile = join(app.getPath('userData'), 'window-bounds.json');
const cookiesFile = join(app.getPath('userData'), 'session-cookies.json');
const backendOriginFile = join(app.getPath('userData'), 'backend-origin.json');
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

// Sidecar mirror of the renderer's `autoLogin` setting. The credential auto-fill
// script runs in the *IdP page* context (an external origin), where the presenter's
// localStorage is not accessible — so the setting must be read in the main process
// and injected into the script as a literal, just like the username/password.
const autoLoginFile = join(app.getPath('userData'), 'auto-login.json');

const loadPersistedAutoLogin = (): boolean => {
  try {
    if (existsSync(autoLoginFile)) {
      const raw = JSON.parse(readFileSync(autoLoginFile, 'utf-8')) as { enabled?: boolean };
      return raw.enabled === true;
    }
  } catch {
    /* ignore */
  }
  return false;
};

/** Latest known value of the renderer's `autoLogin` setting (refreshed on each presenter-page load). */
let autoLoginEnabled = loadPersistedAutoLogin();

const savePersistedAutoLogin = (enabled: boolean) => {
  autoLoginEnabled = enabled;
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(autoLoginFile, JSON.stringify({ enabled }), 'utf-8');
  } catch {
    /* ignore */
  }
};

/**
 * Read the `autoLogin` preference from the presenter renderer's localStorage while a
 * presenter (file://) page is loaded, and cache/persist it for the auto-fill script.
 * No-op on external pages (their localStorage doesn't hold presenter settings).
 */
const refreshAutoLoginFromRenderer = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const url = mainWindow.webContents.getURL();
  if (!url.startsWith('file://')) return;
  mainWindow.webContents
    .executeJavaScript(
      `(() => { try { return JSON.parse(localStorage.getItem('presenter_settings') || '{}').autoLogin === true; } catch { return false; } })()`,
    )
    .then((enabled: boolean) => savePersistedAutoLogin(enabled === true))
    .catch(() => {});
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

// ── Session cookie persistence ──
// Chromium treats cookies without an explicit expiry as "session cookies" and
// discards them when the process exits. We save them to disk before quit and
// restore them (with a 30-day expiry) on the next launch so the user stays
// logged in across app restarts.

const saveSessionCookies = async (): Promise<void> => {
  try {
    // Only save cookies that belong to the presenter backend — never save IDP /
    // SAML / third-party cookies because restoring them causes "Lost
    // authentication state" errors on the next login attempt.
    let allowedHost: string | null = null;
    try {
      if (existsSync(backendOriginFile)) {
        const raw = JSON.parse(readFileSync(backendOriginFile, 'utf-8')) as { origin?: string };
        if (raw.origin) allowedHost = new URL(raw.origin).hostname;
      }
    } catch {
      /* ignore */
    }

    const allCookies = await session.defaultSession.cookies.get({});
    const cookies = allowedHost
      ? allCookies.filter((c) => {
          const domain = c.domain?.replace(/^\./, '') ?? '';
          return domain === allowedHost || domain.endsWith(`.${allowedHost}`);
        })
      : []; // if backend origin is unknown, save nothing rather than saving IDP cookies

    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(cookiesFile, JSON.stringify(cookies), 'utf-8');
    console.log(`[Cookies] Saved ${cookies.length} backend cookie(s)`);
  } catch (err) {
    console.error('[Cookies] Failed to save session cookies:', err);
  }
};

const restoreSessionCookies = async (): Promise<void> => {
  try {
    if (!existsSync(cookiesFile)) return;
    const cookies = JSON.parse(readFileSync(cookiesFile, 'utf-8')) as Electron.Cookie[];
    const thirtyDaysFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    for (const cookie of cookies) {
      try {
        await session.defaultSession.cookies.set({
          url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain?.replace(/^\./, '')}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          expirationDate: cookie.expirationDate ?? thirtyDaysFromNow,
          sameSite: cookie.sameSite,
        });
      } catch {
        // Individual cookie may fail (e.g. invalid domain); skip and continue
      }
    }
    console.log(`[Cookies] Restored ${cookies.length} session cookie(s)`);
  } catch (err) {
    console.error('[Cookies] Failed to restore session cookies:', err);
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
  // Only save bounds when the user intentionally closes the window.
  // Saving on every move/resize would capture OS-clamped values (e.g. taskbar
  // shrinking the height from 1080 → 1040) and persist the wrong size.
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
    // Keep the cached autoLogin preference fresh (no-op on external / IdP pages).
    refreshAutoLoginFromRenderer();
  });

  // Auto-fill OIDC provider login form when the window navigates to an external page.
  // Many IdP pages render their form asynchronously, so we retry with increasing delays
  // until fields are found or a timeout is reached.
  const scheduleAutoFill = async (url: string): Promise<void> => {
    if (!url || url.startsWith('file://') || url.startsWith('about:')) return;

    const creds = getCredentials();
    if (!creds) return;

    // The script returns the number of fields that were actually filled so we know
    // whether to keep retrying.
    const fillScript = `
      (() => {
        const username = ${JSON.stringify(creds.username)};
        const password = ${JSON.stringify(creds.password)};
        // autoLogin is read from the presenter renderer in the MAIN process and injected
        // here as a literal — this script executes in the IdP page context, whose
        // localStorage does NOT contain presenter settings.
        const autoLogin = ${JSON.stringify(autoLoginEnabled)};
        const usernameSelectors = [
          'input#username', 'input[name="username"]',
          'input[type="email"]', 'input#email', 'input[name="email"]',
          'input[autocomplete="username"]', 'input[autocomplete="email"]'
        ];
        const passwordSelectors = [
          'input[type="password"]', 'input#password', 'input[name="password"]'
        ];
        function fill(el, val) {
          try {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value'
            )?.set;
            if (setter) setter.call(el, val);
            else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          } catch { return false; }
        }
        let filled = 0;
        for (const sel of usernameSelectors) {
          const el = document.querySelector(sel);
          if (el) { fill(el, username); filled++; break; }
        }
        for (const sel of passwordSelectors) {
          const el = document.querySelector(sel);
          if (el) { fill(el, password); filled++; break; }
        }
        if (filled > 0 && autoLogin) {
          setTimeout(() => {
            const submitBtn = document.querySelector(
              'button[type="submit"], input[type="submit"], form button:not([type="button"])'
            );
            if (submitBtn) {
              submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            } else {
              const form = document.querySelector('form');
              if (form) form.submit();
            }
          }, 500);
        }
        return filled;
      })()
    `;

    // Retry at increasing intervals to handle pages that render forms asynchronously.
    const retryDelays = [0, 400, 900, 1800, 3200];
    for (const delay of retryDelays) {
      if (delay > 0) await new Promise<void>((r) => setTimeout(r, delay));
      if (!mainWindow || mainWindow.isDestroyed()) break;
      // Abort if the user has already navigated to a different page
      if (mainWindow.webContents.getURL() !== url) break;
      try {
        const filled = (await mainWindow.webContents.executeJavaScript(fillScript)) as number;
        if (filled > 0) {
          console.log(`[Credentials] Auto-filled ${filled} field(s) on ${new URL(url).hostname}`);
          break;
        }
      } catch (err) {
        console.error('[Credentials] Auto-fill attempt failed:', err);
        break;
      }
    }
  };

  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow!.webContents.getURL();
    scheduleAutoFill(url).catch((err) => console.error('[Credentials] Auto-fill error:', err));
  });

  // did-navigate fires when the renderer navigates to a new URL (including IdP redirects).
  // Combined with did-finish-load this ensures we attempt auto-fill on every navigation.
  mainWindow.webContents.on('did-navigate', (_event, url) => {
    scheduleAutoFill(url).catch((err) => console.error('[Credentials] Auto-fill error:', err));
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

// Renderer pushes the autoLogin preference whenever it changes, so the IdP auto-fill
// script always has the current value even if the setting is toggled without a reload.
ipcMain.on('set-auto-login', (_event, enabled: boolean) => {
  savePersistedAutoLogin(enabled === true);
});

// Renderer reports the configured backend URL so will-navigate can identify callbacks
ipcMain.on('set-backend-origin', (_event, origin: string) => {
  backendOrigin = origin;
  // Persist so saveSessionCookies knows which domain to keep
  if (origin) {
    try {
      const dir = app.getPath('userData');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(backendOriginFile, JSON.stringify({ origin }), 'utf-8');
    } catch {
      /* ignore */
    }
  }
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
  electronApp.setAppUserModelId('de.fbbg.presenter');

  // Restore session cookies saved from the previous run so the user stays
  // logged in without re-entering credentials every time.
  // Clear any pre-existing stale cookies first (removes lingering IDP/SAML
  // cookies from old sessions that would cause "Lost authentication state").
  await session.defaultSession.clearStorageData({ storages: ['cookies'] });
  await restoreSessionCookies();

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

// Ensure all child windows are destroyed before quit, and flush session cookies
// to disk so the user stays logged in on the next launch.
let isFlushing = false;
app.on('before-quit', (e) => {
  wsServer.stop();
  windowManager.destroyAll();

  if (isFlushing) return; // second call after our explicit app.quit() below
  e.preventDefault();
  isFlushing = true;

  saveSessionCookies()
    .catch(() => {})
    .finally(() => app.quit());
});
