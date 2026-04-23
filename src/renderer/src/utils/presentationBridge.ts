import type { PresentationContent } from '@/presentation/types';

/**
 * Window configuration for creating presentation windows.
 */
export interface WindowConfig {
  name?: string;
  top?: number;
  left?: number;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  displayMode?: 'normal' | 'stream';
  languages?: string[];
  streamLines?: number;
  fullscreen?: boolean;
  frameless?: boolean;
  alwaysOnTop?: boolean;
  transparent?: boolean;
  hideMouse?: boolean;
  hideText?: boolean;
  hideBackground?: boolean;
  /** Optional preset (style entity id) applied to this window only. */
  styleId?: number;
}

interface PresentationWindowEntry {
  id: string;
  config: WindowConfig;
  window: Window | null; // null when using Electron IPC
  closed: boolean;
  isElectron: boolean;
  /**
   * JSON snapshot of the LAST payload sent to this window. Used to short-circuit
   * the structured-clone cost of `ipcRenderer.send` when the active block/line
   * change hasn't actually altered what this particular window would render —
   * e.g. when a stream window only shows the current line so a *block* change
   * with the same first line produces an identical payload.
   *
   * This is the single biggest perf fix for the "controller lags during fast
   * key auto-repeat" issue in Electron — without it every key produces a fresh
   * structured-clone of the entire content for EVERY presentation window on
   * the controller's renderer thread, blocking paint.
   */
  lastSentSerialized?: string;
}

/** Registry of open presentation windows */
const openWindows: Map<string, PresentationWindowEntry> = new Map();
let windowCounter = 0;

/** Last broadcast content — sent to newly opened windows for initial display */
let lastBroadcastContent: PresentationContent | null = null;

/**
 * Module-level guard: the "restore saved windows on mount" logic in Footer
 * must run at most once per renderer process lifetime. A component-level ref
 * resets on every remount (HMR, route change, parent unmount) which previously
 * caused duplicate presentation BrowserWindows to be opened on top of the ones
 * that were already alive in the main process.
 */
let _hasRestoredSavedWindows = false;
export function getHasRestoredSavedWindows(): boolean {
  return _hasRestoredSavedWindows;
}
export function markRestoredSavedWindows(): void {
  _hasRestoredSavedWindows = true;
}

/**
 * Adopt an already-live Electron presentation window into the bridge registry
 * WITHOUT creating a new BrowserWindow.  Used during the restore-on-mount pass
 * so that BrowserWindows that survived a renderer reload are reused instead of
 * spawning duplicates.
 */
export function adoptElectronWindow(id: string, config: WindowConfig): void {
  if (openWindows.has(id)) return; // already tracked
  openWindows.set(id, {
    id,
    config,
    window: null,
    closed: false,
    isElectron: true,
  });
}

/**
 * Optional resolver supplied by usePresentationSync that, given a window id and
 * its config, returns the per-window resolved style to merge into the content
 * before broadcasting. When undefined, no per-window style override is applied.
 */
type WindowStyleResolver = (id: string, config: WindowConfig) => unknown | undefined;
let windowStyleResolver: WindowStyleResolver | undefined;

export function setWindowStyleResolver(fn: WindowStyleResolver | undefined): void {
  windowStyleResolver = fn;
}

/**
 * Check if Electron API is available.
 */
function isElectron(): boolean {
  return !!(window as unknown as { api?: { createPresentationWindow?: unknown } }).api?.createPresentationWindow;
}

/**
 * Open a new presentation window.
 * In browser mode: uses window.open.
 * In Electron mode: uses IPC to create a BrowserWindow via the main process.
 */
export async function openPresentationWindow(config: WindowConfig = {}): Promise<string> {
  if (isElectron()) {
    return openPresentationWindowElectron(config);
  }
  return openPresentationWindowBrowser(config);
}

/**
 * Open a presentation window via Electron IPC (§7.2, §12).
 */
async function openPresentationWindowElectron(config: WindowConfig): Promise<string> {
  const electronConfig = {
    name: config.name || 'Presentation',
    displayMode: config.displayMode || 'normal',
    languages: config.languages?.join(',') || 'all',
    positionX: config.positionX ?? config.left,
    positionY: config.positionY ?? config.top,
    width: config.width || 1920,
    height: config.height || 1080,
    fullscreen: config.fullscreen || false,
    frameless: config.frameless ?? true,
    alwaysOnTop: config.alwaysOnTop || false,
    hideMouse: config.hideMouse || false,
    hideText: config.hideText || false,
    hideBackground: config.hideBackground || false,
    frozen: false,
    streamLines: config.streamLines,
    streamTransparentBg: config.transparent || false,
  };

  const id = await window.api.createPresentationWindow(electronConfig);

  const entry: PresentationWindowEntry = {
    id,
    config,
    window: null,
    closed: false,
    isElectron: true,
  };

  openWindows.set(id, entry);

  // Push current content to the new window so it doesn't start black
  if (lastBroadcastContent) {
    setTimeout(() => sendContent(id, lastBroadcastContent!), 500);
  }

  return id;
}

/**
 * Open a presentation window in browser mode (window.open).
 */
function openPresentationWindowBrowser(config: WindowConfig): string {
  const id = `presentation-${++windowCounter}`;

  // Browser mode: open a popup window
  const params: Record<string, string | number> = {
    scrollbars: 'no',
    resizable: 'yes',
    status: 'no',
    location: 'no',
    toolbar: 'no',
    menubar: 'no',
    top: config.top ?? 0,
    left: config.left ?? -1920,
    width: config.width ?? 1920,
    height: config.height ?? 1080,
  };

  const windowFeatures = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');

  // Build URL with query params for display mode config
  const queryParams = new URLSearchParams();
  if (config.displayMode) queryParams.set('mode', config.displayMode);
  if (config.name) queryParams.set('name', config.name);
  if (config.streamLines) queryParams.set('lines', String(config.streamLines));
  if (config.languages && config.languages.length > 0) {
    queryParams.set('languages', config.languages.join(','));
  }
  if (config.transparent) {
    queryParams.set('transparent', '1');
  }

  const queryString = queryParams.toString();
  const url = `./presentation.html${queryString ? `?${queryString}` : ''}`;

  const win = window.open(url, id, windowFeatures);

  const entry: PresentationWindowEntry = {
    id,
    config,
    window: win,
    closed: false,
    isElectron: false,
  };

  openWindows.set(id, entry);

  // Monitor for window close
  if (win) {
    const checkClosed = setInterval(() => {
      if (win.closed) {
        entry.closed = true;
        openWindows.delete(id);
        clearInterval(checkClosed);
      }
    }, 1000);

    // Push current content once the window has loaded
    if (lastBroadcastContent) {
      win.addEventListener('load', () => sendContent(id, lastBroadcastContent!));
    }
  }

  return id;
}

/**
 * Close a presentation window by ID.
 */
export async function closePresentationWindow(id: string): Promise<void> {
  const entry = openWindows.get(id);
  if (!entry) return;

  if (entry.isElectron) {
    await window.api.closePresentationWindow(id);
  } else if (entry.window && !entry.window.closed) {
    entry.window.close();
  }
  openWindows.delete(id);
}

/**
 * Close all presentation windows.
 */
export async function closeAllPresentationWindows(): Promise<void> {
  const ids = [...openWindows.keys()];
  for (const id of ids) {
    await closePresentationWindow(id);
  }
}

/**
 * Send content to a specific presentation window.
 */
export async function sendContent(id: string, content: PresentationContent): Promise<void> {
  const entry = openWindows.get(id);
  if (!entry || entry.closed) return;

  if (entry.isElectron) {
    // Apply per-window config overrides
    const windowContent = applyWindowOverrides(content, entry.config, id);
    // Renderer-side dedupe — skip the IPC roundtrip + structured clone if
    // the payload is byte-identical to the last one we sent to this window.
    let serialized = '';
    try {
      serialized = JSON.stringify(windowContent);
    } catch {
      /* fall through */
    }
    if (serialized && serialized === entry.lastSentSerialized) return;
    entry.lastSentSerialized = serialized || undefined;
    window.api.updatePresentationContent(id, windowContent as never);
  } else if (entry.window && !entry.window.closed) {
    // Apply per-window config overrides
    const windowContent = applyWindowOverrides(content, entry.config, id);
    let serialized = '';
    try {
      serialized = JSON.stringify(windowContent);
    } catch {
      /* fall through */
    }
    if (serialized && serialized === entry.lastSentSerialized) return;
    entry.lastSentSerialized = serialized || undefined;

    entry.window.postMessage(
      {
        type: 'UPDATE_PRESENTATION',
        props: { content: windowContent },
      },
      '*',
    );
  }
}

/**
 * Broadcast content to ALL open presentation windows.
 * Sends to every window in parallel — `sendContent` is fire-and-forget for IPC,
 * so awaiting in a loop adds no value but adds tail latency.
 */
export async function broadcastContent(content: PresentationContent): Promise<void> {
  lastBroadcastContent = content;
  // Always send per-window so each window gets its own resolved style override.
  for (const [id] of openWindows) {
    // Intentionally NOT awaited — IPC `send` is one-way and `postMessage` is sync.
    void sendContent(id, content);
  }
}

/**
 * Update an open window's stored config in the bridge registry.
 * MUST be called whenever per-window settings (especially `styleId`) change in
 * Redux/localStorage so the windowStyleResolver picks up the new value on the
 * next broadcast — otherwise the bridge keeps using the config snapshot taken
 * when the window was first opened, and style assignments appear to do nothing
 * until the window is closed and reopened.
 */
export function updateWindowConfigInBridge(id: string, partial: Partial<WindowConfig>): void {
  const entry = openWindows.get(id);
  if (!entry) return;
  entry.config = { ...entry.config, ...partial };
  // Invalidate the per-window dedupe cache so the next broadcast actually
  // picks up the new config (e.g. styleId, displayMode, languages).
  entry.lastSentSerialized = undefined;
}

/**
 * Get a list of open window IDs and their configs.
 */
export async function getOpenWindows(): Promise<Array<{ id: string; config: WindowConfig; closed: boolean }>> {
  // In Electron mode, get live states from main process
  if (isElectron()) {
    try {
      const states = await window.api.getWindowStates();
      // Merge with local registry
      const result: Array<{ id: string; config: WindowConfig; closed: boolean }> = [];
      for (const state of states) {
        const entry = openWindows.get(state.id);
        result.push({
          id: state.id,
          config: entry?.config || {
            name: state.name,
            displayMode: state.displayMode,
          },
          closed: false,
        });
      }
      // Also include browser windows
      for (const [, entry] of openWindows) {
        if (!entry.isElectron && !entry.closed) {
          result.push({ id: entry.id, config: entry.config, closed: entry.closed });
        }
      }
      return result;
    } catch {
      // Fallback to local registry
    }
  }

  const result: Array<{ id: string; config: WindowConfig; closed: boolean }> = [];
  for (const [, entry] of openWindows) {
    result.push({ id: entry.id, config: entry.config, closed: entry.closed });
  }
  return result;
}

/**
 * Synchronous version for backward compatibility (used by Footer polling).
 */
export function getOpenWindowsSync(): Array<{ id: string; config: WindowConfig; closed: boolean }> {
  const result: Array<{ id: string; config: WindowConfig; closed: boolean }> = [];
  for (const [, entry] of openWindows) {
    result.push({ id: entry.id, config: entry.config, closed: entry.closed });
  }
  return result;
}

/**
 * Send an identify command to all windows (toggle ON).
 */
export async function identifyWindows(styleName?: string): Promise<void> {
  if (isElectron()) {
    await window.api.identifyWindows();
  }

  // Also handle browser windows
  let counter = 0;
  for (const [, entry] of openWindows) {
    if (!entry.closed && !entry.isElectron && entry.window && !entry.window.closed) {
      counter++;
      entry.window.postMessage(
        {
          type: 'UPDATE_PRESENTATION',
          props: {
            content: {
              contentType: 'empty',
              displayMode: 'normal',
              activeBlockIndex: 0,
              activeLineIndex: 0,
              blocks: [],
              style: {},
              isBlack: false,
              showIdentify: true,
              windowName: entry.config.name || `Window ${counter}`,
              windowNumber: counter,
              identifyStyleName: styleName,
            },
          },
        },
        '*',
      );
    }
  }
}

/**
 * Hide the identify overlay on all windows (toggle OFF).
 */
export async function hideIdentify(): Promise<void> {
  // In Electron mode, send hide-identify to all Electron windows
  if (isElectron()) {
    await window.api.hideIdentifyWindows();
  }

  // Also handle browser windows
  for (const [, entry] of openWindows) {
    if (!entry.closed && !entry.isElectron && entry.window && !entry.window.closed) {
      entry.window.postMessage({ type: 'HIDE_IDENTIFY' }, '*');
    }
  }
}

/**
 * Fade to black.
 */
export async function fadeToBlack(windowName?: string): Promise<void> {
  if (isElectron()) {
    await window.api.fadeToBlack(windowName);
  }
}

/**
 * Fade from black.
 */
export async function fadeFromBlack(windowName?: string): Promise<void> {
  if (isElectron()) {
    await window.api.fadeFromBlack(windowName);
  }
}

/**
 * Freeze a window.
 */
export async function freezeWindow(windowName: string): Promise<void> {
  if (isElectron()) {
    await window.api.freezeWindow(windowName);
  }
}

/**
 * Unfreeze a window.
 */
export async function unfreezeWindow(windowName: string): Promise<void> {
  if (isElectron()) {
    await window.api.unfreezeWindow(windowName);
  }
}

/**
 * List available screens (Electron only).
 */
export async function listScreens(): Promise<
  Array<{ id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; isPrimary: boolean }>
> {
  if (isElectron()) {
    return window.api.listScreens();
  }
  // In browser mode, we can only detect the current screen
  return [
    {
      id: 0,
      label: 'Current Screen',
      bounds: {
        x: 0,
        y: 0,
        width: window.screen.width,
        height: window.screen.height,
      },
      isPrimary: true,
    },
  ];
}

// ── Helpers ──

/**
 * Apply per-window config overrides to presentation content.
 */
function applyWindowOverrides(content: PresentationContent, config: WindowConfig, id?: string): PresentationContent {
  const merged: PresentationContent = {
    ...content,
    displayMode: config.displayMode || content.displayMode,
    languages: config.languages || content.languages,
    streamLines: config.streamLines || content.streamLines,
    windowName: config.name || content.windowName,
    hideText: config.hideText || content.hideText,
    hideBackground: config.hideBackground || content.hideBackground,
  };

  // If a per-window style preset is configured, layer it on top of the cascade.
  if (id && windowStyleResolver) {
    const windowStyle = windowStyleResolver(id, config);
    if (windowStyle && typeof windowStyle === 'object') {
      const cleanStyle = Object.fromEntries(
        Object.entries(windowStyle as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined),
      );
      merged.style = { ...(merged.style || {}), ...cleanStyle } as typeof merged.style;
    }
  }

  // Derive language filter from the resolved style when no explicit window-config override is set.
  // Style-derived language order takes effect only when no window-level languages are configured.
  if (!config.languages) {
    const style = merged.style as { showAllLanguages?: boolean; languageOrder?: string[] } | undefined;
    if (style?.showAllLanguages) {
      merged.languages = undefined; // show all
    } else if (style?.languageOrder && style.languageOrder.length > 0) {
      merged.languages = style.languageOrder;
    }
  }

  return merged;
}
