import './assets/main.css';

import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { getTheme, resolveThemeMode } from './theme';
import { loadAllLocales } from '@/i18n/i18n-util.sync';
import TypesafeI18n from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';
import ConnectivityChecker from '@/components/settings/ConnectivityChecker';

loadAllLocales();

const LoginApp = () => {
  const { themeMode, uiLanguage } = useGetSettings();
  const resolvedMode = resolveThemeMode(themeMode);
  const muiTheme = useMemo(() => getTheme(resolvedMode), [resolvedMode]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <TypesafeI18n locale={uiLanguage}>
        <ConnectivityChecker />
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<LoginPage />} />
          </Routes>
        </BrowserRouter>
      </TypesafeI18n>
    </ThemeProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <LoginApp />
    </Provider>
  </StrictMode>,
);

