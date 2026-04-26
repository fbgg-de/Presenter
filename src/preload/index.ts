import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { MusicianViewConfig } from '../shared/types';

// Custom APIs for renderer — full ElectronAPI per §7.3
const api = {
  // ── Basic window controls ──
  minimize: () => electronAPI.ipcRenderer.invoke('window-minimize'),
  close: () => electronAPI.ipcRenderer.invoke('window-close'),
  maximize: () => electronAPI.ipcRenderer.invoke('window-maximize'),

  // ── App info ──
  getAppVersion: () => electronAPI.ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => electronAPI.ipcRenderer.invoke('check-for-updates'),

  // ── System ──
  getSystemFonts: () => electronAPI.ipcRenderer.invoke('get-system-fonts'),

  // ── File system ──
  openDirectory: (path: string) => electronAPI.ipcRenderer.invoke('open-directory', path),
  pickFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) =>
    electronAPI.ipcRenderer.invoke('pick-file', options ?? {}),
  pickDirectory: (options?: { title?: string; defaultPath?: string }) => electronAPI.ipcRenderer.invoke('pick-directory', options ?? {}),

  // ── Presentation window management ──
  createPresentationWindow: (config: unknown) => electronAPI.ipcRenderer.invoke('create-presentation-window', config),
  closePresentationWindow: (id: string) => electronAPI.ipcRenderer.invoke('close-presentation-window', id),
  focusPresentationWindow: (id: string) => electronAPI.ipcRenderer.invoke('focus-presentation-window', id),
  hidePresentationWindow: (id: string) => electronAPI.ipcRenderer.invoke('hide-presentation-window', id),
  showPresentationWindow: (id: string) => electronAPI.ipcRenderer.invoke('show-presentation-window', id),
  updateWindowConfig: (id: string, partial: unknown) => electronAPI.ipcRenderer.invoke('update-window-config', id, partial),
  updatePresentationContent: (id: string, content: unknown) => {
    ipcRenderer.send('update-presentation-content', id, content);
  },
  broadcastPresentationContent: (content: unknown) => {
    ipcRenderer.send('broadcast-presentation-content', content);
  },
  listScreens: () => electronAPI.ipcRenderer.invoke('list-screens'),
  getWindowStates: () => electronAPI.ipcRenderer.invoke('get-window-states'),

  // ── Window actions ──
  fadeToBlack: (windowName?: string) => electronAPI.ipcRenderer.invoke('fade-to-black', windowName),
  fadeFromBlack: (windowName?: string) => electronAPI.ipcRenderer.invoke('fade-from-black', windowName),
  freezeWindow: (windowName: string) => electronAPI.ipcRenderer.invoke('freeze-window', windowName),
  unfreezeWindow: (windowName: string) => electronAPI.ipcRenderer.invoke('unfreeze-window', windowName),
  identifyWindows: () => electronAPI.ipcRenderer.invoke('identify-windows'),
  hideIdentifyWindows: () => electronAPI.ipcRenderer.invoke('hide-identify-windows'),

  // ── Video commands ──
  videoCommand: (command: { action: string; windowName?: string; value?: number; fadeDuration?: number; target?: string }) =>
    electronAPI.ipcRenderer.invoke('video-command', command),
  setVideoVisible: (payload?: { windowName?: string; value?: boolean; mode?: 'cut' | 'fade'; durationMs?: number }) =>
    electronAPI.ipcRenderer.invoke('set-video-visible', payload || {}),

  // ── Media ──
  checkMediaFiles: (files: string[]) => electronAPI.ipcRenderer.invoke('check-media-files', files),
  getMediaServerUrl: () => electronAPI.ipcRenderer.invoke('get-media-server-url'),
  startMediaServer: (mediaPath: string) => electronAPI.ipcRenderer.invoke('start-media-server', mediaPath),

  // ── Musician view ──
  openMusicianView: (config?: MusicianViewConfig) => electronAPI.ipcRenderer.invoke('open-musician-view', config || {}),

  // ── Settings export/import ──
  exportSettings: () => electronAPI.ipcRenderer.invoke('export-settings'),
  importSettings: () => electronAPI.ipcRenderer.invoke('import-settings'),
  applyImportedSettings: (diff: unknown) => electronAPI.ipcRenderer.invoke('apply-imported-settings', diff),

  // ── WebSocket broadcast (renderer -> main -> WS clients) ──
  wsBroadcast: (action: string, data?: Record<string, unknown>) => ipcRenderer.send('ws-broadcast', action, data),

  // ── Video status from presentation windows ──
  onVideoStatus: (callback: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('video-status-update', handler);
    return () => {
      ipcRenderer.removeListener('video-status-update', handler);
    };
  },

  // ── IPC event listeners (main -> renderer) ──
  onWsNavigationAction: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('ws-navigation-action', handler);
    return () => {
      ipcRenderer.removeListener('ws-navigation-action', handler);
    };
  },
  onWsVideoAction: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('ws-video-action', handler);
    return () => {
      ipcRenderer.removeListener('ws-video-action', handler);
    };
  },
  onWsGetState: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('ws-get-state', handler);
    return () => {
      ipcRenderer.removeListener('ws-get-state', handler);
    };
  },
  sendWsStateResponse: (data: unknown) => {
    ipcRenderer.send('ws-state-response', data);
  },
  onPresentationWindowBoundsChanged: (
    callback: (data: { id: string; bounds: { x: number; y: number; width: number; height: number } }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) =>
      callback(data as { id: string; bounds: { x: number; y: number; width: number; height: number } });
    ipcRenderer.on('presentation-window-bounds-changed', handler);
    return () => {
      ipcRenderer.removeListener('presentation-window-bounds-changed', handler);
    };
  },
  removeAllWsListeners: () => {
    ipcRenderer.removeAllListeners('ws-navigation-action');
    ipcRenderer.removeAllListeners('ws-video-action');
    ipcRenderer.removeAllListeners('ws-get-state');
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
