import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { getTheme, resolveThemeMode } from './theme';
import { detectLocale } from '@/i18n/i18n-util';
import { navigatorDetector } from 'typesafe-i18n/detectors';
import { loadAllLocales } from '@/i18n/i18n-util.sync';
import TypesafeI18n from '@/i18n/i18n-react';
import SessionExpired from '@/components/SessionExpired';
import { BrowserRouter, Route, Routes, Navigate, useParams } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import { MainPage } from '@/pages/MainPage';
import { AdminPage } from '@/pages/AdminPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import { MusicianPage } from '@/musician/MusicianPage';
import ConnectivityChecker from '@/components/settings/ConnectivityChecker';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetMusicianSettings } from '@/store/musicianSlice';

// Load all locales upfront so switching is instant
loadAllLocales();

/** Wrapper providing the musician-specific theme */
const MusicianThemeWrapper = () => {
  const { musicianTheme } = useGetMusicianSettings();

  const muiTheme = useMemo(() => getTheme(musicianTheme), [musicianTheme]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <MusicianPage />
    </ThemeProvider>
  );
};

/** Redirect /a/:licenseNumber → /login?license=... so the account is pre-selected */
const AccountLoginRedirect = () => {
  const { licenseNumber } = useParams<{ licenseNumber: string }>();
  return <Navigate to={`/login?license=${encodeURIComponent(licenseNumber ?? '')}`} replace />;
};

const App = () => {
  const { themeMode, uiLanguage, offlineMode } = useGetSettings();

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
  const locale = (uiLanguage === 'de' ? 'de' : uiLanguage === 'en' ? 'en' : detectedLocale === 'de' ? 'de' : 'en') as 'en' | 'de';

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <TypesafeI18n key={locale} locale={locale}>
        <ConnectivityChecker />
        {!offlineMode && <SessionExpired />}

        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/a/:licenseNumber" element={<AccountLoginRedirect />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/:tab" element={<AdminPage />} />
            <Route path="/notes" element={<MusicianThemeWrapper />} />
            <Route path="/*" element={<MainPage />} />
          </Routes>
        </BrowserRouter>
      </TypesafeI18n>
    </ThemeProvider>
  );
};

export default App;
