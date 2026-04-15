import { useEffect, useMemo, useState, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Snackbar, Alert, Button } from '@mui/material';
import { getTheme, resolveThemeMode } from './theme';
import { detectLocale } from '@/i18n/i18n-util';
import { navigatorDetector } from 'typesafe-i18n/detectors';
import { loadLocale } from '@/i18n/i18n-util.sync';
import TypesafeI18n from '@/i18n/i18n-react';
import { useI18nContext } from '@/i18n/i18n-react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { MainPage } from '@/pages/MainPage';
import { AdminPage } from '@/pages/AdminPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { MusicianPage } from '@/musician/MusicianPage';
import { useAppSelector } from '@/store';
import { SESSION_EXPIRED_EVENT } from '@/api/base.api';

/** Wrapper providing the musician-specific theme */
const MusicianThemeWrapper = () => {
  const musicianTheme = useAppSelector((s) => s.settings.musicianTheme);
  const muiTheme = useMemo(() => getTheme(musicianTheme), [musicianTheme]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <MusicianPage />
    </ThemeProvider>
  );
};

const App = () => {
  const themeMode = useAppSelector((state) => state.theme.mode);
  const uiLanguage = useAppSelector((state) => state.settings.uiLanguage);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Listen for session expiry events from the API layer
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const handleRelogin = useCallback(() => {
    setSessionExpired(false);
    window.location.href = '/login';
  }, []);

  // Resolve system theme and listen for OS preference changes
  const [resolvedMode, setResolvedMode] = useState(resolveThemeMode(themeMode));

  useEffect(() => {
    setResolvedMode(resolveThemeMode(themeMode));

    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => setResolvedMode(mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    return undefined;
  }, [themeMode]);

  const muiTheme = useMemo(() => getTheme(resolvedMode), [resolvedMode]);

  // Determine locale: prefer user setting, then browser detection
  const detectedLocale = detectLocale(navigatorDetector);
  const locale = (uiLanguage || detectedLocale) as 'en' | 'de';

  const [activeLocale, setActiveLocale] = useState<'en' | 'de'>(() => {
    loadLocale(locale);
    return locale;
  });

  useEffect(() => {
    loadLocale(locale);
    setActiveLocale(locale);
  }, [locale]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <TypesafeI18n locale={activeLocale}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/notes" element={<MusicianThemeWrapper />} />
            <Route path="/*" element={<MainPage />} />
          </Routes>
        </BrowserRouter>
        <SessionExpiredSnackbar open={sessionExpired} onClose={() => setSessionExpired(false)} onRelogin={handleRelogin} />
      </TypesafeI18n>
    </ThemeProvider>
  );
};

const SessionExpiredSnackbar = ({ open, onClose, onRelogin }: { open: boolean; onClose: () => void; onRelogin: () => void }) => {
  const { LL } = useI18nContext();

  return (
    <Snackbar open={open} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} onClose={onClose}>
      <Alert
        severity="warning"
        variant="filled"
        onClose={onClose}
        action={
          <Button color="inherit" size="small" onClick={onRelogin}>
            {LL.LOGIN()}
          </Button>
        }
      >
        {LL.SESSION_EXPIRED_MESSAGE()}
      </Alert>
    </Snackbar>
  );
};

export default App;
