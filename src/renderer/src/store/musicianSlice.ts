import { useCallback } from 'react';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useAppDispatch, useAppSelector } from './hooks';

const MUSICIAN_SETTINGS_KEY = 'presenter_musician_settings';

export interface MusicianState {
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
}

const defaultMusicianSettings: MusicianState = {
  musicianName: '',
  musicianBand: '',
  musicianPageView: 'one-page',
  musicianBlockIndicator: true,
  musicianTextSize: 16,
  musicianTheme: 'dark',
  musicianShowFooter: true,
  musicianToolbarExpanded: true,
  musicianSyncMode: 'operator',
  musicianSidebarOpen: true,
  musicianLastItemIndex: 0,
};

let initialState: MusicianState = { ...defaultMusicianSettings };
try {
  const settings = localStorage.getItem(MUSICIAN_SETTINGS_KEY);
  if (settings) {
    initialState = { ...defaultMusicianSettings, ...JSON.parse(settings) };
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
      localStorage.setItem(MUSICIAN_SETTINGS_KEY, JSON.stringify(state));
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
