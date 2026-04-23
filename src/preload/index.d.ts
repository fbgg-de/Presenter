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
  pickFile: (options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    defaultPath?: string;
  }) => Promise<{ path: string; url: string } | null>;
  pickDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>;

  // ── Presentation window management ──
  createPresentationWindow: (config: WindowConfig) => Promise<string>;
  closePresentationWindow: (id: string) => Promise<void>;
  updateWindowConfig: (id: string, partial: Partial<WindowConfig>) => Promise<{ applied: string[]; requiresReload: string[] }>;
  updatePresentationContent: (id: string, content: PresentationContentIPC) => void;
  broadcastPresentationContent: (content: PresentationContentIPC) => void;
  listScreens: () => Promise<ScreenInfo[]>;
  getWindowStates: () => Promise<WindowState[]>;

  // ── Window actions ──
  fadeToBlack: (windowName?: string) => Promise<void>;
  fadeFromBlack: (windowName?: string) => Promise<void>;
  freezeWindow: (windowName: string) => Promise<void>;
  unfreezeWindow: (windowName: string) => Promise<void>;
  identifyWindows: () => Promise<void>;
  hideIdentifyWindows: () => Promise<void>;

  // ── Video commands ──
  videoCommand: (command: { action: string; windowName?: string; value?: number; fadeDuration?: number }) => Promise<void>;
  setVideoVisible: (payload?: { windowName?: string; value?: boolean; mode?: 'cut' | 'fade'; durationMs?: number }) => Promise<void>;

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

  // ── Video status from presentation windows ──
  onVideoStatus: (callback: (status: VideoStatus) => void) => (() => void) | void;

  // ── IPC event listeners (main -> renderer) ──
  onWsNavigationAction: (callback: (data: unknown) => void) => (() => void) | void;
  onWsVideoAction: (callback: (data: unknown) => void) => (() => void) | void;
  onWsGetState: (callback: (data: unknown) => void) => (() => void) | void;
  sendWsStateResponse: (data: unknown) => void;
  onPresentationWindowBoundsChanged: (
    callback: (data: { id: string; bounds: { x: number; y: number; width: number; height: number } }) => void,
  ) => (() => void) | void;
  removeAllWsListeners: () => void;
}

export interface VideoStatus {
  hasVideo: boolean;
  paused?: boolean;
  muted?: boolean;
  loop?: boolean;
  volume?: number;
  currentTime?: number;
  duration?: number;
  windowName?: string;
}

/** Presentation window preload API (separate preload script). */
export interface PresentationAPI {
  onContentUpdate: (callback: (data: unknown) => void) => void;
  onCommand: (callback: (data: unknown) => void) => void;
  removeAllListeners: () => void;
  reportVideoStatus?: (status: VideoStatus) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: FrontendAPI;
    presentationApi?: PresentationAPI;
  }
}
