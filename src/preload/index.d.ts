import { ElectronAPI } from '@electron-toolkit/preload';
import type {
  WindowConfig,
  WindowState,
  ScreenInfo,
  MediaCheckResult,
  SettingsDiff,
  MusicianViewConfig,
  UpdateInfo,
  PresentationContentIPC,
} from '../shared/types';

export interface FrontendAPI {
  // ── Basic window controls ──
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  maximize: () => Promise<void>;

  // ── App info ──
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<UpdateInfo>;

  // ── System ──
  getSystemFonts: () => Promise<string[]>;

  // ── File system ──
  openDirectory: (path: string) => Promise<boolean>;

  // ── Presentation window management ──
  createPresentationWindow: (config: WindowConfig) => Promise<string>;
  closePresentationWindow: (id: string) => Promise<void>;
  updatePresentationContent: (id: string, content: PresentationContentIPC) => Promise<void>;
  broadcastPresentationContent: (content: PresentationContentIPC) => Promise<void>;
  listScreens: () => Promise<ScreenInfo[]>;
  getWindowStates: () => Promise<WindowState[]>;

  // ── Window actions ──
  fadeToBlack: (windowName?: string) => Promise<void>;
  fadeFromBlack: (windowName?: string) => Promise<void>;
  freezeWindow: (windowName: string) => Promise<void>;
  unfreezeWindow: (windowName: string) => Promise<void>;
  identifyWindows: () => Promise<void>;
  hideIdentifyWindows: () => Promise<void>;

  // ── Media ──
  checkMediaFiles: (files: string[]) => Promise<MediaCheckResult>;
  getMediaServerUrl: () => Promise<string>;
  startMediaServer: (mediaPath: string) => Promise<string>;

  // ── Musician view ──
  openMusicianView: (config?: MusicianViewConfig) => Promise<string>;

  // ── Settings export/import ──
  exportSettings: () => Promise<string | null>;
  importSettings: () => Promise<SettingsDiff | null>;
  applyImportedSettings: (diff: SettingsDiff) => Promise<void>;

  // ── WebSocket broadcast ──
  wsBroadcast: (action: string, data?: Record<string, unknown>) => void;

  // ── IPC event listeners (main -> renderer) ──
  onWsNavigationAction: (callback: (data: unknown) => void) => void;
  onWsVideoAction: (callback: (data: unknown) => void) => void;
  onWsGetState: (callback: (data: unknown) => void) => void;
  sendWsStateResponse: (data: unknown) => void;
  removeAllWsListeners: () => void;
}

/** Presentation window preload API (separate preload script). */
export interface PresentationAPI {
  onContentUpdate: (callback: (data: unknown) => void) => void;
  onCommand: (callback: (data: unknown) => void) => void;
  removeAllListeners: () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: FrontendAPI;
    presentationApi?: PresentationAPI;
  }
}
