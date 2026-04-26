import './assets/main.css';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { getTheme } from './theme';
import { MusicianPage } from '@/musician/MusicianPage';
import { loadAllLocales } from '@/i18n/i18n-util.sync';
import TypesafeI18n from '@/i18n/i18n-react';
import { useGetMusicianSettings } from '@/store/musicianSlice';
import { useGetSettings } from '@/store/settingsSlice';

loadAllLocales();

/** Wrapper that reads the musician-specific theme from Redux */
const MusicianApp = () => {
  const { uiLanguage } = useGetSettings();
  const { musicianTheme } = useGetMusicianSettings();
  const muiTheme = useMemo(() => getTheme(musicianTheme), [musicianTheme]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <TypesafeI18n locale={uiLanguage}>
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
