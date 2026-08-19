import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useAppSelector, useAppDispatch } from './hooks';
import { useCallback } from 'react';
import { persistState, registerEvictor, EVICT_PRIORITY } from './persist';

export const SETTINGS_KEY = 'presenter_settings';

export type Languages = 'en' | 'de';
export type ThemeMode = 'dark' | 'light' | 'system';
export type Account = number | 'admin' | '';
type ClickBehaviour = 'click' | 'double-click';
type Transition = 'cut' | 'fade';
/** Aspect ratio the control view frames media previews in (mirrors the presentation screen). */
export type MediaPreviewAspect = '16:9' | '16:10' | '4:3';

/**
 * Set List view state. Lives inside the settings object (rather than its own localStorage key)
 * so it rides the existing settings export/import, which copies every `presenter_*` key.
 */
export interface SetListsSettings {
  /** Restored on open; ignored when the list no longer exists. */
  lastOpenedSetListId: number | null;
  /** setListId → tagName → expanded. Scoped per set list, stale tag names are ignored. */
  accordionStateBySetListId: Record<string, Record<string, boolean>>;
  /** How many of the most recently saved shows feed the per-song usage counts (1–20). */
  usageShowCount: number;
}

export interface SettingsState {
  autoCheckUpdates: boolean;
  autoLogin: boolean;
  backendUrl: string;
  bibleTranslation: string;
  cachedStyles: object[];
  confirmPageLeave: boolean;
  confirmShowDeletion: boolean;
  confirmShowOverwrite: boolean;
  confirmSongDelete: boolean;
  companionCommandsEnabled: boolean;
  defaultNewVerseName: string;
  desktopAppDismissed: boolean;
  deviceId: string;
  globalStyleId: number;
  hideTransitionDuration: number;
  hideTransitionMode: Transition;
  /** When ChurchTools is enabled, include CCLI SongSelect results in the unified search. Persisted. */
  includeChurchToolsResults: boolean;
  keyboardMapping: Record<string, { enabled: boolean; key: string }>;
  lastSelectedAccount?: Account;
  mediaPath: string;
  /** Aspect ratio of the media preview frame in the control view. */
  mediaPreviewAspect: MediaPreviewAspect;
  metricsEnabled: boolean;
  nextLinePreview: boolean;
  notificationCount: number;
  notificationTime: number;
  offlineMode: boolean;
  overrideSongImport: boolean;
  /** Mobile remote (/control): which commands connected devices may trigger. Missing key = allowed. */
  remoteControlCommands: Record<string, boolean>;
  resetBlackOnSwitch: boolean;
  restoreWindowsOnStart: boolean;
  /** Set List manager view state (last opened list + per-list accordion expansion). */
  setLists: SetListsSettings;
  showDeleteFromDb: boolean;
  showLicenseNumber: boolean;
  showSaveFormat: string;
  songClick: ClickBehaviour;
  themeMode: ThemeMode;
  touchDuration: number;
  transitionDuration: number;
  transitionMode: Transition;
  uiLanguage: Languages;
  uploadNotifications: boolean;
  errorBoundaryNotification: boolean;
  verseClick: ClickBehaviour;
  videoFadeDuration: number;
  windowFooterVisible: boolean;
}

const defaultState: SettingsState = {
  autoCheckUpdates: true,
  autoLogin: false,
  backendUrl: '',
  bibleTranslation: 'ESV',
  cachedStyles: [],
  confirmPageLeave: true,
  confirmShowDeletion: true,
  confirmShowOverwrite: true,
  confirmSongDelete: true,
  companionCommandsEnabled: true,
  defaultNewVerseName: 'Vers 1',
  desktopAppDismissed: false,
  // crypto.randomUUID() requires a secure context (HTTPS / localhost).
  // Guard against HTTP deployments (common on local networks) and older iOS Safari (<15.4).
  deviceId:
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  globalStyleId: 0,
  hideTransitionDuration: 300,
  hideTransitionMode: 'cut',
  includeChurchToolsResults: true,
  keyboardMapping: {},
  lastSelectedAccount: '',
  mediaPath: '',
  mediaPreviewAspect: '16:9',
  metricsEnabled: true,
  nextLinePreview: true,
  notificationCount: 4,
  notificationTime: 3500,
  offlineMode: false,
  overrideSongImport: false,
  remoteControlCommands: {},
  resetBlackOnSwitch: false,
  restoreWindowsOnStart: true,
  setLists: { lastOpenedSetListId: null, accordionStateBySetListId: {}, usageShowCount: 8 },
  showDeleteFromDb: false,
  showLicenseNumber: true,
  showSaveFormat: 'Show {dd}.{MM}.{yyyy}',
  songClick: 'double-click',
  themeMode: 'system',
  touchDuration: 300,
  transitionDuration: 500,
  transitionMode: 'cut',
  uiLanguage: 'en',
  uploadNotifications: true,
  errorBoundaryNotification: true,
  verseClick: 'double-click',
  videoFadeDuration: 0,
  windowFooterVisible: true,
};

/** The value every setting falls back to — the UI compares against this to offer a reset. */
export const SETTINGS_DEFAULTS: Readonly<SettingsState> = defaultState;

let initialState: SettingsState = { ...defaultState };
try {
  const settings = localStorage.getItem(SETTINGS_KEY);
  if (settings) {
    const parsed = JSON.parse(settings);
    // Migrate old standalone device_id key if not yet in settings
    if (!parsed.deviceId) {
      const legacyId = localStorage.getItem('presenter_device_id');
      if (legacyId) {
        parsed.deviceId = legacyId;
        localStorage.removeItem('presenter_device_id');
      }
    }
    initialState = { ...defaultState, ...parsed };
    // The spread above is shallow, so a settings file written before this key existed (or a
    // partial one) would leave `setLists` half-formed. Rebuild it from the defaults.
    initialState.setLists = {
      ...defaultState.setLists,
      ...(typeof parsed.setLists === 'object' && parsed.setLists !== null ? parsed.setLists : {}),
    };
    if (typeof initialState.setLists.accordionStateBySetListId !== 'object' || initialState.setLists.accordionStateBySetListId === null) {
      initialState.setLists.accordionStateBySetListId = {};
    }
  }
} catch {
  console.log('Failed to load settings from localStorage, using defaults');
}

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    updateSetting: (state, action: PayloadAction<{ key: keyof SettingsState; value: unknown }>) => {
      const { key, value } = action.payload;
      (state as any)[key] = value;
      persistState(SETTINGS_KEY, state);
    },
  },
});

/**
 * `cachedStyles` is the offline copy of the style library and is refetched the moment the
 * app is online, but it is stored inside the settings blob — the one key that must never
 * be given up. Left alone that inverts the whole storage priority: the biggest optional
 * payload would sit in the most protected key and push the irreplaceable settings out.
 *
 * So the field is evictable even though its container is not. Only the persisted copy is
 * stripped; the in-memory value stays, so the current session keeps rendering offline
 * styles and the next successful fetch writes them back.
 */
registerEvictor({
  name: 'cached styles',
  priority: EVICT_PRIORITY.OPTIONAL_CACHE,
  run: () => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!Array.isArray(parsed.cachedStyles) || parsed.cachedStyles.length === 0) return false;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...parsed, cachedStyles: [] }));
      return true;
    } catch {
      return false;
    }
  },
});

export const getSetting = <K extends keyof SettingsState>(k: K): SettingsState[K] => {
  try {
    const settings = localStorage.getItem(SETTINGS_KEY);
    if (settings) {
      const parsed = JSON.parse(settings);
      if (parsed[k] !== undefined) {
        return parsed[k];
      }
    }
  } catch {}
  return defaultState[k];
};
export const useGetSettings = () => useAppSelector((state) => state.settings);
export const useUpdateSetting = () => {
  const dispatch = useAppDispatch();
  return useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      dispatch(settingsSlice.actions.updateSetting({ key, value }));
    },
    [dispatch],
  );
};

export default settingsSlice.reducer;
