import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// All localStorage-backed settings per §21.3
// Each key corresponds to a `presenter_*` localStorage key

interface SettingsState {
  backendUrl: string;
  uiLanguage: string;
  languageOverride: string;
  confirmPageLeave: boolean;
  confirmShowDeletion: boolean;
  confirmShowOverwrite: boolean;
  confirmSongDelete: boolean;
  defaultNewVerseName: string;
  defaultVerseName: string;
  notificationCount: number;
  notificationTime: number;
  overrideSongImport: boolean;
  reloadSongAfterEdit: boolean;
  resetBlackOnSwitch: boolean;
  showLimit: number;
  nextLinePreview: boolean;
  nextLinePreviewColor: string;
  nextLineTranslation: boolean;
  showDeleteFromDb: boolean;
  uploadNotifications: boolean;
  songClick: 'click' | 'double-click';
  songOrder: 'lexicographic' | 'numeric';
  controlLayout: 'boxed' | 'list';
  touchDuration: number;
  verseClick: 'click' | 'double-click';
  bibleTranslation: string;
  keyboardMapping: Record<string, string>;
  keyboardEnabled: Record<string, boolean>;
  windowConfigs: object[];
  windowPresets: Record<string, object>;
  windowFooterVisible: boolean;
  mediaPath: string;
  wsPort: number;
  autoCheckUpdates: boolean;
  musicianName: string;
  musicianBand: string;
  musicianPageView: 'two-page' | 'one-page';
  musicianBlockIndicator: boolean;
  musicianTextSize: number;
  musicianTheme: 'dark' | 'light';
  musicianShowFooter: boolean;
  musicianToolbarExpanded: boolean;
  musicianSyncMode: 'off' | 'operator' | 'midi' | 'midi-ws';
  musicianSidebarOpen: boolean;
  musicianLastItemIndex: number;
  midiMappings: Record<string, Record<string, string>>;
  midiTrackingMaster: 'operator' | 'midi';
  globalStyleId: number;
  showSaveFormat: string;
  keyboardNavigationSongs: boolean;
  keyboardNavigationBlocks: boolean;
  keyboardNavigationLines: boolean;
  restoreWindowsOnStart: boolean;
  transitionMode: 'cut' | 'fade';
  transitionDuration: number;
}

const loadString = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const loadBool = (key: string, fallback: boolean): boolean => {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  } catch {
    return fallback;
  }
};

const loadNumber = (key: string, fallback: number): number => {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number(v);
    return isNaN(n) ? fallback : n;
  } catch {
    return fallback;
  }
};

const loadJson = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

// ── Grouped musician settings ──
// All musician-specific settings are stored in a single localStorage key
const MUSICIAN_SETTINGS_KEY = 'presenter_musician_settings';

interface MusicianSettings {
  name: string;
  band: string;
  pageView: 'two-page' | 'one-page';
  blockIndicator: boolean;
  textSize: number;
  theme: 'dark' | 'light';
  showFooter: boolean;
  toolbarExpanded: boolean;
  syncMode: 'off' | 'operator' | 'midi' | 'midi-ws';
  sidebarOpen: boolean;
  lastItemIndex: number;
}

const defaultMusicianSettings: MusicianSettings = {
  name: '',
  band: '',
  pageView: 'one-page',
  blockIndicator: true,
  textSize: 16,
  theme: 'dark',
  showFooter: true,
  toolbarExpanded: true,
  syncMode: 'operator',
  sidebarOpen: true,
  lastItemIndex: 0,
};

/** Load grouped musician settings */
function loadMusicianSettings(): MusicianSettings {
  try {
    const grouped = localStorage.getItem(MUSICIAN_SETTINGS_KEY);
    if (grouped) {
      const parsed = JSON.parse(grouped);
      return { ...defaultMusicianSettings, ...parsed };
    }
  } catch {}

  return { ...defaultMusicianSettings };
}

const musicianSettings = loadMusicianSettings();

const initialState: SettingsState = {
  backendUrl: loadString('presenter_backend_url', 'http://localhost:9000'),
  uiLanguage: loadString('presenter_ui_language', ''),
  languageOverride: loadString('presenter_language_override', ''),
  confirmPageLeave: loadBool('presenter_confirm_page_leave', true),
  confirmShowDeletion: loadBool('presenter_confirm_show_deletion', true),
  confirmShowOverwrite: loadBool('presenter_confirm_show_overwrite', true),
  confirmSongDelete: loadBool('presenter_confirm_song_delete', true),
  defaultNewVerseName: loadString('presenter_default_new_verse_name', 'Outro'),
  defaultVerseName: loadString('presenter_default_verse_name', 'Vers 1'),
  notificationCount: loadNumber('presenter_notification_count', 4),
  notificationTime: loadNumber('presenter_notification_time', 3500),
  overrideSongImport: loadBool('presenter_override_song_import', false),
  reloadSongAfterEdit: loadBool('presenter_reload_song_after_edit', false),
  resetBlackOnSwitch: loadBool('presenter_reset_black_on_switch', false),
  showLimit: loadNumber('presenter_show_limit', 10),
  nextLinePreview: loadBool('presenter_next_line_preview', true),
  nextLinePreviewColor: loadString('presenter_next_line_preview_color', '#AAAAAA'),
  nextLineTranslation: loadBool('presenter_next_line_translation', true),
  showDeleteFromDb: loadBool('presenter_show_delete_from_db', false),
  uploadNotifications: loadBool('presenter_upload_notifications', true),
  songClick: loadString('presenter_song_click', 'double-click') as 'click' | 'double-click',
  songOrder: loadString('presenter_song_order', 'lexicographic') as 'lexicographic' | 'numeric',
  controlLayout: loadString('presenter_control_layout', 'boxed') as 'boxed' | 'list',
  touchDuration: loadNumber('presenter_touch_duration', 300),
  verseClick: loadString('presenter_verse_click', 'double-click') as 'click' | 'double-click',
  bibleTranslation: loadString('presenter_bible_translation', 'ESV'),
  keyboardMapping: loadJson('presenter_keyboard_mapping', {}),
  keyboardEnabled: loadJson('presenter_keyboard_enabled', {}),
  windowConfigs: (loadJson<object[]>('presenter_window_configs', [])).map((c) => {
    // Strip transient runtime ID — it's only valid within a single app session.
    // On next start the restore logic will reopen all configs that lack _runtimeId.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { _runtimeId: _, ...rest } = c as any;
    return rest;
  }),
  windowPresets: loadJson('presenter_window_presets', {}),
  windowFooterVisible: loadBool('presenter_window_footer_visible', true),
  mediaPath: loadString('presenter_media_path', ''),
  wsPort: loadNumber('presenter_ws_port', 9001),
  autoCheckUpdates: loadBool('presenter_auto_check_updates', true),
  musicianName: musicianSettings.name,
  musicianBand: musicianSettings.band,
  musicianPageView: musicianSettings.pageView,
  musicianBlockIndicator: musicianSettings.blockIndicator,
  musicianTextSize: musicianSettings.textSize,
  musicianTheme: musicianSettings.theme,
  musicianShowFooter: musicianSettings.showFooter,
  musicianToolbarExpanded: musicianSettings.toolbarExpanded,
  musicianSyncMode: musicianSettings.syncMode,
  musicianSidebarOpen: musicianSettings.sidebarOpen,
  musicianLastItemIndex: musicianSettings.lastItemIndex,
  midiMappings: loadJson('presenter_midi_mappings', {}),
  midiTrackingMaster: loadString('presenter_midi_tracking_master', 'operator') as 'operator' | 'midi',
  globalStyleId: loadNumber('presenter_global_style_id', 0),
  showSaveFormat: loadString('presenter_show_save_format', 'Show {dd}.{MM}.{yyyy}'),
  keyboardNavigationSongs: loadBool('presenter_keyboard_navigation_songs', true),
  keyboardNavigationBlocks: loadBool('presenter_keyboard_navigation_blocks', true),
  keyboardNavigationLines: loadBool('presenter_keyboard_navigation_lines', true),
  restoreWindowsOnStart: loadBool('presenter_restore_windows_on_start', false),
  transitionMode: loadString('presenter_transition_mode', 'cut') as 'cut' | 'fade',
  transitionDuration: loadNumber('presenter_transition_duration', 500),
};

// Musician setting keys that are stored in the grouped object
const musicianKeyMap: Record<string, keyof MusicianSettings> = {
  musicianName: 'name',
  musicianBand: 'band',
  musicianPageView: 'pageView',
  musicianBlockIndicator: 'blockIndicator',
  musicianTextSize: 'textSize',
  musicianTheme: 'theme',
  musicianShowFooter: 'showFooter',
  musicianToolbarExpanded: 'toolbarExpanded',
  musicianSyncMode: 'syncMode',
  musicianSidebarOpen: 'sidebarOpen',
  musicianLastItemIndex: 'lastItemIndex',
};

// Helper to persist a setting
const persist = (key: string, value: unknown) => {
  try {
    // Check if this is a musician setting — persist to grouped key
    const musicianField = musicianKeyMap[key];
    if (musicianField) {
      const current = loadJson<MusicianSettings>(MUSICIAN_SETTINGS_KEY, defaultMusicianSettings);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (current as any)[musicianField] = value;
      localStorage.setItem(MUSICIAN_SETTINGS_KEY, JSON.stringify(current));
      return;
    }

    // Standard key
    const lsKey = 'presenter_' + key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (typeof value === 'object') {
      localStorage.setItem(lsKey, JSON.stringify(value));
    } else {
      localStorage.setItem(lsKey, String(value));
    }
  } catch {}
};

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSetting: <K extends keyof SettingsState>(state: SettingsState, action: PayloadAction<{ key: K; value: SettingsState[K] }>) => {
      const { key, value } = action.payload;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state as any)[key] = value;
      persist(key, value);
    },
    updateSetting: (state, action: PayloadAction<{ key: keyof SettingsState; value: unknown }>) => {
      const { key, value } = action.payload;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state as any)[key] = value;
      persist(key, value);
    },
  },
});

export const { updateSetting } = settingsSlice.actions;

// Typed setting updater for use in components
export const setSettingAction = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
  settingsSlice.actions.updateSetting({ key, value: value as unknown });

export type { SettingsState };
export default settingsSlice.reducer;
