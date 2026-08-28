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

/**
 * The sample content the style editor's preview renders.
 *
 * A device preference rather than part of a style: it is what *you* want to look at while
 * designing, and saving it into the style would push it out to every presentation window.
 *
 * `languages` is indexed by language slot — entry 0 is the main language, entry 1 the second —
 * so the sample follows whatever slots a style defines rather than naming fixed languages.
 */
export type StylePreviewPaneId = 'labels' | 'sample' | 'copyright';

export interface StylePreviewSample {
  /**
   * Which shipped sample this was derived from. See {@link STYLE_PREVIEW_VERSION}.
   */
  version: number;
  /**
   * The preview canvases, in the order they are stacked. `visible` decides which are drawn —
   * the order is kept for the hidden ones too, so paging to one and back does not shuffle them.
   */
  panes: { id: StylePreviewPaneId; visible: boolean }[];
  /**
   * Sample lyrics per language slot. A `---` line splits the block being shown from the one
   * that follows it, exactly as it does in a real song, so the next-block preview is written
   * in the same box as the lyrics rather than a field of its own.
   */
  languages: { code: string; lines: string[] }[];
  /** Metadata for the copyright canvas. */
  title: string;
  authors: string;
  copyright: string;
}

/** Every pane, in the order a fresh install stacks them. */
export const STYLE_PREVIEW_PANES: StylePreviewPaneId[] = ['labels', 'sample', 'copyright'];

/**
 * Bump this whenever the shipped sample below changes.
 *
 * The stored copy is merged *over* the defaults, which is right for a preference someone has
 * adjusted — and wrong for one nobody has, because a stale `languages` array then shadows the
 * shipped sample forever. That is what made edits to the default invisible during development:
 * the code changed, the browser kept showing what it had saved. A version mismatch now replaces
 * the stored sample outright instead of merging it.
 */
export const STYLE_PREVIEW_VERSION = 2;

/**
 * A private copy of the shipped sample.
 *
 * `DEFAULT_STYLE_PREVIEW` is a module constant, so handing it out directly would let a later
 * edit mutate the fallback every future reset falls back to.
 */
export const freshStylePreview = (): StylePreviewSample => ({
  ...DEFAULT_STYLE_PREVIEW,
  panes: DEFAULT_STYLE_PREVIEW.panes.map((pane) => ({ ...pane })),
  languages: DEFAULT_STYLE_PREVIEW.languages.map((entry) => ({ ...entry, lines: [...entry.lines] })),
});

/**
 * What the preview starts out showing: two lyric lines in three languages, a following block
 * after the `---`, and a copyright block — between them they exercise every text setting a
 * style has.
 *
 * The lines are placeholder text written for this purpose rather than taken from a song, and
 * they double as documentation for the `---` syntax. "Amazing Grace" names the sample in the
 * copyright block, where title, author and licence are metadata rather than lyrics. Anyone who
 * wants their own words here pastes them into the Preview tab, which is the point of it being
 * editable.
 */
export const DEFAULT_STYLE_PREVIEW: StylePreviewSample = {
  version: STYLE_PREVIEW_VERSION,
  panes: [
    { id: 'labels', visible: true },
    { id: 'sample', visible: true },
    { id: 'copyright', visible: false },
  ],
  languages: [
    {
      code: 'EN',
      lines: [
        'Amazing grace how sweet the sound',
        'That saved a wretch like me',
        "I once was lost but now I'm found",
        'Was blind but now I see',
        '---',
        "'Twas grace that taught my heart to fear",
      ],
    },
    {
      code: 'DE',
      lines: [
        'Es klingt zu gut, um wahr zu sein',
        'die Gnade fand auch mich.',
        'Ich war verlorn, doch bin jetzt sein,',
        'war blind, jetzt seh ich Licht.',
        '---',
        'Die Gnade lehrte Ehrfurcht mich,',
      ],
    },
    {
      code: 'FR',
      lines: [
        'Ô grâce infinie, qui vint sauver',
        'Un pécheur tel que moi!',
        "J'étais perdu : Il m'a trouvé;",
        "J'étais aveugle : je vois!",
        '---',
        'Il me libère, brise mes chaînes,',
      ],
    },
  ],
  title: 'Amazing Grace',
  authors: 'John Newton',
  copyright: 'Public Domain',
};

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
  /** Sample content shown in the style editor preview. */
  stylePreview: StylePreviewSample;
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
  stylePreview: DEFAULT_STYLE_PREVIEW,
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
    // The preview sample is only merged when it came from *this* build's shipped sample.
    // Anything older is replaced outright — see STYLE_PREVIEW_VERSION for why.
    const storedPreview = typeof parsed.stylePreview === 'object' && parsed.stylePreview !== null ? parsed.stylePreview : {};

    if (storedPreview.version === STYLE_PREVIEW_VERSION) {
      initialState.stylePreview = { ...freshStylePreview(), ...storedPreview };

      // Same shallow-spread problem one level down: a stored half of an array would render an
      // empty preview with no way to tell why.
      if (!Array.isArray(initialState.stylePreview.languages) || initialState.stylePreview.languages.length === 0) {
        initialState.stylePreview.languages = freshStylePreview().languages;
      }
      // Panes are rebuilt rather than trusted: one missing a pane would make that preview
      // unreachable with no way to get it back.
      const storedPanes = Array.isArray(initialState.stylePreview.panes) ? initialState.stylePreview.panes : [];
      const known = storedPanes.filter((pane) => pane && STYLE_PREVIEW_PANES.includes(pane.id));
      initialState.stylePreview.panes = [
        ...known,
        ...DEFAULT_STYLE_PREVIEW.panes.filter((fallback) => !known.some((pane) => pane.id === fallback.id)),
      ];
    } else {
      initialState.stylePreview = freshStylePreview();
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
