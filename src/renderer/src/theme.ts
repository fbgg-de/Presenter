import { createTheme, type Theme } from '@mui/material';
import type { ThemeMode } from './store/settingsSlice';

const PRIMARY = {
  main: '#C44D58',
  dark: '#89353d',
  light: '#CF7079',
  contrastText: '#FFF',
};

const SECONDARY = {
  main: '#4ECDC4',
  dark: '#368F89',
  light: '#71D7CF',
  contrastText: '#FFF',
};

export const DEFAULT_SONG_ITEM_COLOR = '#1976d2';
export const DEFAULT_MEDIA_ITEM_COLOR = '#f9a825';
export const DEFAULT_BIBLE_ITEM_COLOR = '#388e3c';

export const ANNOTATION_COLORS = ['#ff0000', '#0000ff', '#00aa00', '#ffaa00', '#000000', '#ffffff', '#9c27b0'];

export const BLOCK_COLORS = ['#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#795548'];

export const COLOR_PRESETS = [
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Green', value: '#00FF00' },
  { name: 'Blue', value: '#0000FF' },
  { name: 'Yellow', value: '#FFFF00' },
  { name: 'Cyan', value: '#00FFFF' },
  { name: 'Magenta', value: '#FF00FF' },
  { name: 'Dark Gray', value: '#333333' },
  { name: 'Light Gray', value: '#CCCCCC' },
  { name: 'Navy', value: '#001F3F' },
  { name: 'Teal', value: '#39CCCC' },
];

export const getTheme = (mode: 'dark' | 'light'): Theme =>
  createTheme({
    palette: {
      mode,
      primary: PRIMARY,
      secondary: SECONDARY,
      ...(mode === 'dark'
        ? {
            text: { primary: '#FFF' },
            background: { paper: '#161616', default: '#0F1214' },
            common: { white: '#FFF', black: '#0F1214' },
          }
        : {
            text: { primary: '#1a1a1a' },
            background: { paper: '#FFFFFF', default: '#F5F5F5' },
            common: { white: '#FFF', black: '#1a1a1a' },
          }),
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (themeParam) => ({
          body:
            themeParam.palette.mode === 'dark'
              ? {
                  scrollbarColor: '#6b6b6b #2b2b2b',
                  '&::-webkit-scrollbar, &::-webkit-scrollbar *': {
                    backgroundColor: '#2b2b2b',
                  },
                  '&::-webkit-scrollbar-thumb, &::-webkit-scrollbar-thumb *': {
                    backgroundColor: '#6b6b6b',
                    borderRadius: 8,
                  },
                }
              : null,
        }),
      },
    },
  });

/** Resolve 'system' to actual mode */
export const resolveThemeMode = (mode: ThemeMode): 'dark' | 'light' => {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
};
