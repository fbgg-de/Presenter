import { useCallback } from 'react';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useAppDispatch, useAppSelector } from './hooks';
import type { MidiAction } from '@/hooks/useMidi';
import { persistState } from './persist';

type TrackingMaster = 'operator' | 'midi';

const MUSICIAN_SETTINGS_KEY = 'presenter_musician_settings';

export interface MusicianState {
  musicianName: string;
  musicianBand: string;
  /**
   * Annotation layer selected for editing by default when the PDF annotation toolbar opens.
   * Empty means "my own layer" — the musician name, or `default` when no name is set.
   * Set it to `default` to edit the shared layer everyone sees.
   */
  musicianAnnotationLayer: string;
  musicianPageView: 'two-page' | 'one-page';
  musicianBlockIndicator: boolean;
  musicianTextSize: number;
  musicianTheme: 'dark' | 'light';
  musicianShowFooter: boolean;
  musicianToolbarExpanded: boolean;
  musicianSyncMode: 'off' | 'operator' | 'midi';
  musicianSidebarOpen: boolean;
  musicianLastItemIndex: number;
  /** Auto-apply server updates (show, songs, orders, PDFs, annotations) without asking. */
  musicianAutoRefresh: boolean;
  /** Remote control: MIDI message key (e.g. "cc_64") → action. */
  midiMappings: Record<string, MidiAction>;
  /** Who drives block tracking on the operator side: the operator or the MIDI musician. */
  midiTrackingMaster: TrackingMaster;
  /** Remote control: keyboard combo (e.g. "Ctrl+ArrowRight") → action. */
  musicianKeyboardMappings: Record<string, MidiAction>;
  /**
   * Remote control: ignore a repeat of the SAME action within this many milliseconds.
   * Guards against bouncing footswitches double-triggering a jump. 0 disables the filter.
   */
  musicianRemoteDebounceMs: number;
}

const defaultMusicianSettings: MusicianState = {
  musicianName: '',
  musicianBand: '',
  musicianAnnotationLayer: '',
  musicianPageView: 'one-page',
  musicianBlockIndicator: true,
  musicianTextSize: 16,
  musicianTheme: 'dark',
  musicianShowFooter: true,
  musicianToolbarExpanded: true,
  musicianSyncMode: 'operator',
  musicianSidebarOpen: true,
  musicianLastItemIndex: 0,
  musicianAutoRefresh: false,
  midiMappings: {},
  midiTrackingMaster: 'operator',
  musicianKeyboardMappings: {},
  musicianRemoteDebounceMs: 0,
};

let initialState: MusicianState = { ...defaultMusicianSettings };
try {
  const settings = localStorage.getItem(MUSICIAN_SETTINGS_KEY);
  const parsed: Partial<MusicianState> = settings ? JSON.parse(settings) : {};
  initialState = { ...defaultMusicianSettings, ...parsed };
  if ((parsed as { musicianSyncMode?: string }).musicianSyncMode === 'midi-ws') {
    initialState.musicianSyncMode = 'midi';
  }
} catch (e) {
  console.error('Failed to load musician settings', e);
}

export const musicianSlice = createSlice({
  name: 'musician',
  initialState,
  reducers: {
    updateMusicianSetting: (state, action: PayloadAction<{ key: keyof MusicianState; value: MusicianState[keyof MusicianState] }>) => {
      const { key, value } = action.payload;
      (state as any)[key] = value;
      persistState(MUSICIAN_SETTINGS_KEY, state);
    },
  },
});

export const useGetMusicianSettings = () => useAppSelector((state) => state.musician);
export const useUpdateMusicianSetting = () => {
  const dispatch = useAppDispatch();
  return useCallback(
    <K extends keyof MusicianState>(key: K, value: MusicianState[K]) => {
      dispatch(musicianSlice.actions.updateMusicianSetting({ key, value }));
    },
    [dispatch],
  );
};

export default musicianSlice.reducer;
