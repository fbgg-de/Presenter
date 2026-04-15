import './assets/main.css';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Provider, useSelector } from 'react-redux';
import { store, type RootState } from '@/store';
import { getTheme } from './theme';
import { MusicianPage } from '@/musician/MusicianPage';
import { detectLocale } from '@/i18n/i18n-util';
import { navigatorDetector } from 'typesafe-i18n/detectors';
import { loadLocale } from '@/i18n/i18n-util.sync';
import TypesafeI18n from '@/i18n/i18n-react';

// Determine locale
const detectedLocale = detectLocale(navigatorDetector);
const savedLocale = localStorage.getItem('presenter_ui_language');
const locale = (savedLocale || detectedLocale) as 'en' | 'de';
loadLocale(locale);

/** Wrapper that reads the musician-specific theme from Redux */
const MusicianApp = () => {
  const musicianTheme = useSelector((s: RootState) => s.settings.musicianTheme);
  const muiTheme = useMemo(() => getTheme(musicianTheme), [musicianTheme]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <TypesafeI18n locale={locale}>
        <MusicianPage />
      </TypesafeI18n>
    </ThemeProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <MusicianApp />
    </Provider>
  </StrictMode>,
);
