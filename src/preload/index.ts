import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

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

  // ── Presentation window management ──
  createPresentationWindow: (config: unknown) => electronAPI.ipcRenderer.invoke('create-presentation-window', config),
  closePresentationWindow: (id: string) => electronAPI.ipcRenderer.invoke('close-presentation-window', id),
  updatePresentationContent: (id: string, content: unknown) => electronAPI.ipcRenderer.invoke('update-presentation-content', id, content),
  broadcastPresentationContent: (content: unknown) => electronAPI.ipcRenderer.invoke('broadcast-presentation-content', content),
  listScreens: () => electronAPI.ipcRenderer.invoke('list-screens'),
  getWindowStates: () => electronAPI.ipcRenderer.invoke('get-window-states'),

  // ── Window actions ──
  fadeToBlack: (windowName?: string) => electronAPI.ipcRenderer.invoke('fade-to-black', windowName),
  fadeFromBlack: (windowName?: string) => electronAPI.ipcRenderer.invoke('fade-from-black', windowName),
  freezeWindow: (windowName: string) => electronAPI.ipcRenderer.invoke('freeze-window', windowName),
  unfreezeWindow: (windowName: string) => electronAPI.ipcRenderer.invoke('unfreeze-window', windowName),
  identifyWindows: () => electronAPI.ipcRenderer.invoke('identify-windows'),
  hideIdentifyWindows: () => electronAPI.ipcRenderer.invoke('hide-identify-windows'),

  // ── Media ──
  checkMediaFiles: (files: string[]) => electronAPI.ipcRenderer.invoke('check-media-files', files),
  getMediaServerUrl: () => electronAPI.ipcRenderer.invoke('get-media-server-url'),
  startMediaServer: (mediaPath: string) => electronAPI.ipcRenderer.invoke('start-media-server', mediaPath),

  // ── Musician view ──
  openMusicianView: (config?: unknown) => electronAPI.ipcRenderer.invoke('open-musician-view', config || {}),

  // ── Settings export/import ──
  exportSettings: () => electronAPI.ipcRenderer.invoke('export-settings'),
  importSettings: () => electronAPI.ipcRenderer.invoke('import-settings'),
  applyImportedSettings: (diff: unknown) => electronAPI.ipcRenderer.invoke('apply-imported-settings', diff),

  // ── WebSocket broadcast (renderer -> main -> WS clients) ──
  wsBroadcast: (action: string, data?: Record<string, unknown>) => ipcRenderer.send('ws-broadcast', action, data),

  // ── IPC event listeners (main -> renderer) ──
  onWsNavigationAction: (callback: (data: unknown) => void) => {
    ipcRenderer.on('ws-navigation-action', (_event, data) => callback(data));
  },
  onWsVideoAction: (callback: (data: unknown) => void) => {
    ipcRenderer.on('ws-video-action', (_event, data) => callback(data));
  },
  onWsGetState: (callback: (data: unknown) => void) => {
    ipcRenderer.on('ws-get-state', (_event, data) => callback(data));
  },
  sendWsStateResponse: (data: unknown) => {
    ipcRenderer.send('ws-state-response', data);
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
