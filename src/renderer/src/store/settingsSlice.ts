import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useAppSelector, useAppDispatch } from './hooks';
import { useCallback } from 'react';

export const SETTINGS_KEY = 'presenter_settings';

export type Languages = 'en' | 'de';
export type ThemeMode = 'dark' | 'light' | 'system';
export type Account = number | 'admin' | '';
type ClickBehaviour = 'click' | 'double-click';
type Transition = 'cut' | 'fade';
type Order = 'lexicographic' | 'numeric';

/**
 * Set List view state. Lives inside the settings object (rather than its own localStorage key)
 * so it rides the existing settings export/import, which copies every `presenter_*` key.
 */
export interface SetListsSettings {
  /** Restored on open; ignored when the list no longer exists. */
  lastOpenedSetListId: number | null;
  /** setListId → tagName → expanded. Scoped per set list, stale tag names are ignored. */
  accordionStateBySetListId: Record<string, Record<string, boolean>>;
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
  defaultVerseName: string;
  desktopAppDismissed: boolean;
  deviceId: string;
  globalStyleId: number;
  hideTransitionDuration: number;
  hideTransitionMode: Transition;
  /** When ChurchTools is enabled, include CCLI SongSelect results in the unified search. Persisted. */
  includeChurchToolsResults: boolean;
  keyboardMapping: Record<string, { enabled: boolean; key: string }>;
  keyboardNavigationBlocks: boolean;
  keyboardNavigationLines: boolean;
  keyboardNavigationSongs: boolean;
  lastSelectedAccount?: Account;
  mediaPath: string;
  metricsEnabled: boolean;
  nextLinePreview: boolean;
  nextLinePreviewColor: string;
  nextLineTranslation: boolean;
  notificationCount: number;
  notificationTime: number;
  offlineMode: boolean;
  overrideSongImport: boolean;
  reloadSongAfterEdit: boolean;
  /** Mobile remote (/control): which commands connected devices may trigger. Missing key = allowed. */
  remoteControlCommands: Record<string, boolean>;
  resetBlackOnSwitch: boolean;
  restoreWindowsOnStart: boolean;
  /** Set List manager view state (last opened list + per-list accordion expansion). */
  setLists: SetListsSettings;
  showDeleteFromDb: boolean;
  showLicenseNumber: boolean;
  showLimit: number;
  showSaveFormat: string;
  songClick: ClickBehaviour;
  songOrder: Order;
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
  defaultVerseName: 'Vers 1',
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
  keyboardNavigationBlocks: true,
  keyboardNavigationLines: true,
  keyboardNavigationSongs: true,
  lastSelectedAccount: '',
  mediaPath: '',
  metricsEnabled: true,
  nextLinePreview: true,
  nextLinePreviewColor: '#AAAAAA',
  nextLineTranslation: true,
  notificationCount: 4,
  notificationTime: 3500,
  offlineMode: false,
  overrideSongImport: false,
  reloadSongAfterEdit: false,
  remoteControlCommands: {},
  resetBlackOnSwitch: false,
  restoreWindowsOnStart: true,
  setLists: { lastOpenedSetListId: null, accordionStateBySetListId: {} },
  showDeleteFromDb: false,
  showLicenseNumber: true,
  showLimit: 10,
  showSaveFormat: 'Show {dd}.{MM}.{yyyy}',
  songClick: 'double-click',
  songOrder: 'lexicographic',
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
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
    },
    toggleTheme: (state) => {
      switch (state.themeMode) {
        case 'dark':
          state.themeMode = 'light';
          break;
        case 'light':
          state.themeMode = 'system';
          break;
        default:
          state.themeMode = 'dark';
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
    },
  },
});

export const { toggleTheme } = settingsSlice.actions;

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
