/**
 * Shared types used across main, preload, and renderer processes.
 * Per §7, §12, §22 of the requirements specification.
 */

// ── Window Management Types ──

export type DisplayMode = 'normal' | 'stream';

export interface VideoMask {
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100
  height: number; // 0-100
}

/**
 * Configuration for creating a presentation window (§12.5).
 */
export interface WindowConfig {
  name: string;
  displayMode: DisplayMode;
  languages: string; // "all", "EN", "EN,DE", etc.
  positionX?: number;
  positionY?: number;
  width: number;
  height: number;
  fullscreen: boolean;
  frameless: boolean;
  alwaysOnTop: boolean;
  hideMouse: boolean;
  hideText: boolean;
  hideBackground: boolean;
  frozen: boolean;
  streamLines?: number;
  streamTransparentBg?: boolean;
  videoMask?: VideoMask | null;
}

/**
 * Runtime state of a presentation window.
 */
export interface WindowState {
  id: string;
  name: string;
  displayMode: DisplayMode;
  frozen: boolean;
  isBlack: boolean;
  fullscreen: boolean;
  hidden?: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  screenId?: number;
}

/**
 * Display/screen information from Electron's screen API.
 */
export interface ScreenInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

/**
 * Media file existence check result.
 */
export type MediaCheckResult = Record<string, boolean>;

/**
 * Settings diff for import/export (§7.5).
 */
export interface SettingsDiff {
  added: Record<string, string>;
  changed: Record<string, { old: string; new: string }>;
  removed: string[];
}

/**
 * Config for opening the musician view window.
 */
export interface MusicianViewConfig {
  width?: number;
  height?: number;
  positionX?: number;
  positionY?: number;
}

/**
 * Update info from auto-updater.
 */
export interface UpdateInfo {
  updateAvailable: boolean;
  isTokenAvailable: boolean;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string | string[];
}

// ── WebSocket Protocol Types (§22.2) ──

export interface WSCommand {
  id?: string;
  action: string;
  target?: string; // window name
  payload?: Record<string, unknown>;
}

export interface WSResponse {
  id?: string;
  type: 'response' | 'broadcast';
  action: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ── Presentation Content IPC ──

/**
 * Presentation content sent from renderer to main process
 * for distribution to presentation BrowserWindows.
 */
export interface PresentationContentIPC {
  contentType: 'song' | 'bible_verse' | 'media' | 'empty';
  displayMode: DisplayMode;
  activeBlockIndex: number;
  activeLineIndex: number;
  blocks: Array<{
    name: string;
    lines: Array<{
      text: string;
      language?: string;
      bold?: boolean;
    }>;
  }>;
  style: Record<string, unknown>;
  isBlack: boolean;
  title?: string;
  copyright?: string;
  authors?: string;
  mediaSubType?: 'image' | 'video' | 'color';
  mediaPath?: string;
  mediaColor?: string;
  bibleRef?: string;
  bibleTranslation?: string;
  bibleCopyright?: string;
  nextBlockPreviewLines?: Array<{ text: string; language?: string; bold?: boolean }>;
  nextLinePreviewColor?: string;
  languages?: string[];
  streamLines?: number;
  hideText?: boolean;
  hideBackground?: boolean;
  windowName?: string;
  showIdentify?: boolean;
  transitionMode?: 'cut' | 'fade';
  transitionDuration?: number;
}
