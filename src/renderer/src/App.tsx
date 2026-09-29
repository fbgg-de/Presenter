import { useEffect, useMemo, useState, useRef, type ErrorInfo } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { getTheme, resolveThemeMode } from './theme';
import { detectLocale } from '@/i18n/i18n-util';
import { navigatorDetector } from 'typesafe-i18n/detectors';
import { loadAllLocales } from '@/i18n/i18n-util.sync';
import TypesafeI18n from '@/i18n/i18n-react';
import SessionExpired from '@/components/SessionExpired';
import { BrowserRouter, Route, Routes, Navigate, useParams } from 'react-router-dom';
import { MainPage } from '@/pages/MainPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';
import ConnectivityChecker from '@/components/settings/ConnectivityChecker';
import { SETTINGS_KEY, getSetting, useGetSettings } from '@/store/settingsSlice';
import { useMetricSync } from '@/hooks/useMetricSync';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { GlobalErrorHandler } from '@/components/common/GlobalErrorHandler';
import { useGetSessionQuery } from '@/api/session.api';
import { AUTO_LOGIN_STARTED_KEY } from '@/utils';
import { enqueueMetric } from '@/utils/metricQueue';
import { getDeviceId } from '@/utils/deviceId';

// Load all locales upfront so switching is instant
loadAllLocales();

/** Redirect /a/:licenseNumber → /login?license=... so the account is pre-selected */
const AccountLoginRedirect = () => {
  const { licenseNumber } = useParams<{ licenseNumber: string }>();
  return <Navigate to={`/login?license=${encodeURIComponent(licenseNumber ?? '')}`} replace />;
};

/**
 * Hard-navigation redirect to a separate HTML entry point.
 * Passes the current path/search through as a query param so the target app
 * can optionally restore state (e.g. deep-linking into a tab).
 */
const HardRedirect = ({ to }: { to: string }) => {
  useEffect(() => {
    window.location.replace(to + window.location.search);
  }, [to]);
  return null;
};

const App = () => {
  useMetricSync();

  const { themeMode, uiLanguage, offlineMode } = useGetSettings('themeMode', 'uiLanguage', 'offlineMode');
  const [boundaryError, setBoundaryError] = useState<Error | null>(null);
  const freshStartTracked = useRef(false);

  // Track fresh start — fired when no settings exist yet in localStorage. Queued rather than sent:
  // a first launch is signed out, the server refuses metrics without a session, and
  // useMetricSync sends the queue once signed in.
  useEffect(() => {
    if (freshStartTracked.current) return;
    freshStartTracked.current = true;
    const hasSettings = !!localStorage.getItem(SETTINGS_KEY);
    if (!hasSettings && getSetting('metricsEnabled')) {
      enqueueMetric({ event: 'fresh_start', metadata: { device_id: getDeviceId(), language: navigator.language } });
    }
  }, []);

  // Signing out is handled where a page needs a session (RequireAuth, with the way back in `next`).
  // Redirecting here as well raced it and dropped `next`, and sent /unauthorized (a refused sign-in)
  // to the login page before its reason could be read.
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const signedIn = session?.isAuthenticated === true;
  useEffect(() => {
    if (!signedIn) return;
    // Signed in, so the login page may sign in automatically again next time (see LoginPage).
    try {
      sessionStorage.removeItem(AUTO_LOGIN_STARTED_KEY);
    } catch {
      // Storage unavailable — nothing was stored to clear.
    }
  }, [signedIn]);

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
        <GlobalErrorHandler boundaryError={boundaryError} />
        <ErrorBoundary onError={(err: Error, _info: ErrorInfo) => setBoundaryError(err)}>
          <ConnectivityChecker>
            {!offlineMode && <SessionExpired />}

            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<HardRedirect to="/login" />} />
                <Route path="/a/:licenseNumber" element={<AccountLoginRedirect />} />
                <Route path="/unauthorized" element={<UnauthorizedPage />} />
                <Route path="/admin" element={<HardRedirect to="/admin" />} />
                <Route path="/admin/*" element={<HardRedirect to="/admin" />} />
                <Route path="/notes" element={<HardRedirect to="/notes" />} />
                <Route path="/*" element={<MainPage />} />
              </Routes>
            </BrowserRouter>
          </ConnectivityChecker>
        </ErrorBoundary>
      </TypesafeI18n>
    </ThemeProvider>
  );
};

export default App;
