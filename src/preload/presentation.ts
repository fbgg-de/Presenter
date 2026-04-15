/**
 * Preload script for presentation BrowserWindows.
 * Exposes a minimal API for receiving content updates from the main process via IPC.
 */
import { contextBridge, ipcRenderer } from 'electron';

const presentationApi = {
  /**
   * Register a callback for content updates from the main process.
   */
  onContentUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('presentation-update', (_event, data) => {
      callback(data);
    });
  },

  /**
   * Register a callback for presentation commands (fade, identify, etc.).
   */
  onCommand: (callback: (data: unknown) => void) => {
    ipcRenderer.on('presentation-command', (_event, data) => {
      callback(data);
    });
  },

  /**
   * Remove all listeners (for cleanup).
   */
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('presentation-update');
    ipcRenderer.removeAllListeners('presentation-command');
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('presentationApi', presentationApi);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore
  window.presentationApi = presentationApi;
}
