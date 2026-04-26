import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useAppSelector, useAppDispatch } from './hooks';
import type { MidiAction } from '@/hooks/useMidi';
import { useCallback } from 'react';

const SETTINGS_KEY = 'presenter_settings';

export type Languages = 'en' | 'de';
export type ThemeMode = 'dark' | 'light' | 'system';
export type Account = number | 'admin' | '';
type ClickBehaviour = 'click' | 'double-click';
type Transition = 'cut' | 'fade';
type Order = 'lexicographic' | 'numeric';
type TrackingMaster = 'operator' | 'midi';

export interface SettingsState {
  autoCheckUpdates: boolean;
  backendUrl: string;
  bibleTranslation: string;
  cachedStyles: object[];
  confirmPageLeave: boolean;
  confirmShowDeletion: boolean;
  confirmShowOverwrite: boolean;
  confirmSongDelete: boolean;
  defaultNewVerseName: string;
  defaultVerseName: string;
  desktopAppDismissed: boolean;
  globalStyleId: number;
  hideTransitionDuration: number;
  hideTransitionMode: Transition;
  keyboardMapping: Record<string, { enabled: boolean; key: string }>;
  keyboardNavigationBlocks: boolean;
  keyboardNavigationLines: boolean;
  keyboardNavigationSongs: boolean;
  lastSelectedAccount?: Account;
  mediaPath: string;
  midiMappings: Partial<Record<MidiAction, string>>;
  midiTrackingMaster: TrackingMaster;
  nextLinePreview: boolean;
  nextLinePreviewColor: string;
  nextLineTranslation: boolean;
  notificationCount: number;
  notificationTime: number;
  offlineMode: boolean;
  overrideSongImport: boolean;
  reloadSongAfterEdit: boolean;
  resetBlackOnSwitch: boolean;
  restoreWindowsOnStart: boolean;
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
  verseClick: ClickBehaviour;
  videoFadeDuration: number;
  windowFooterVisible: boolean;
  wsPort: number;
}

const defaultState: SettingsState = {
  autoCheckUpdates: true,
  backendUrl: '',
  bibleTranslation: 'ESV',
  cachedStyles: [],
  confirmPageLeave: true,
  confirmShowDeletion: true,
  confirmShowOverwrite: true,
  confirmSongDelete: true,
  defaultNewVerseName: 'Outro',
  defaultVerseName: 'Vers 1',
  desktopAppDismissed: false,
  globalStyleId: 0,
  hideTransitionDuration: 300,
  hideTransitionMode: 'cut',
  keyboardMapping: {},
  keyboardNavigationBlocks: true,
  keyboardNavigationLines: true,
  keyboardNavigationSongs: true,
  lastSelectedAccount: '',
  mediaPath: '',
  midiMappings: {},
  midiTrackingMaster: 'operator',
  nextLinePreview: true,
  nextLinePreviewColor: '#AAAAAA',
  nextLineTranslation: true,
  notificationCount: 4,
  notificationTime: 3500,
  offlineMode: false,
  overrideSongImport: false,
  reloadSongAfterEdit: false,
  resetBlackOnSwitch: false,
  restoreWindowsOnStart: true,
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
  verseClick: 'double-click',
  videoFadeDuration: 0,
  windowFooterVisible: true,
  wsPort: 9001,
};

let initialState: SettingsState = { ...defaultState };
try {
  const settings = localStorage.getItem(SETTINGS_KEY);
  if (settings) {
    initialState = { ...defaultState, ...JSON.parse(settings) };
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
