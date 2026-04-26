import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useAppSelector, useAppDispatch } from './hooks';
import { useCallback } from 'react';

export const WINDOWS_KEY = 'presenter_windows';

export interface WindowConfig {
  name?: string;
  top?: number;
  left?: number;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  displayMode?: 'normal' | 'stream';
  languages?: string[];
  streamLines?: number;
  fullscreen?: boolean;
  frameless?: boolean;
  alwaysOnTop?: boolean;
  transparent?: boolean;
  hideMouse?: boolean;
  hideText?: boolean;
  hideBackground?: boolean;
  /** Optional preset (style entity id) applied to this window only. */
  styleId?: number;
}

export interface SavedWindowConfig extends WindowConfig {
  _runtimeId?: string; // set when the window is open
}

export interface WindowState {
  windowConfigs: SavedWindowConfig[];
  windowPresets: Record<string, object>;
}

const defaultState: WindowState = {
  windowConfigs: [],
  windowPresets: {},
};

let initialState: WindowState = defaultState;
try {
  const windows = localStorage.getItem(WINDOWS_KEY);
  if (windows) {
    initialState = { ...defaultState, ...JSON.parse(windows) };
  }
} catch (e) {
  console.error('Failed to load windows from localStorage', e);
}

export const windowSlice = createSlice({
  name: 'window',
  initialState,
  reducers: {
    updateWindowSetting: (state, action: PayloadAction<{ key: keyof WindowState; value: unknown }>) => {
      const { key, value } = action.payload;
      (state as any)[key] = value;
      localStorage.setItem(WINDOWS_KEY, JSON.stringify(state));
    },
  },
});

export const useGetWindows = () => useAppSelector((state) => state.window);
export const useUpdateWindows = () => {
  const dispatch = useAppDispatch();
  return useCallback(
    <K extends keyof WindowState>(key: K, value: WindowState[K]) => {
      dispatch(windowSlice.actions.updateWindowSetting({ key, value }));
    },
    [dispatch],
  );
};

export default windowSlice.reducer;
