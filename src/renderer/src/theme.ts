import { createTheme, type Theme } from '@mui/material';
import darkScrollbar from '@mui/material/darkScrollbar';
import type { ThemeMode } from '@/store/themeSlice';

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
          body: themeParam.palette.mode === 'dark' ? darkScrollbar() : null,
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

// Keep a default export for backward compatibility
export const theme = getTheme('dark');
