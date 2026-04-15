import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface ThemeState {
  mode: ThemeMode;
}

const loadThemeMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem('presenter_theme_mode');
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
  } catch {}
  return 'system';
};

const initialState: ThemeState = {
  mode: loadThemeMode(),
};

export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      state.mode = action.payload;
      localStorage.setItem('presenter_theme_mode', action.payload);
    },
    toggleTheme: (state) => {
      const next: ThemeMode = state.mode === 'dark' ? 'light' : state.mode === 'light' ? 'system' : 'dark';
      state.mode = next;
      localStorage.setItem('presenter_theme_mode', next);
    },
  },
});

export const { setThemeMode, toggleTheme } = themeSlice.actions;
export default themeSlice.reducer;
