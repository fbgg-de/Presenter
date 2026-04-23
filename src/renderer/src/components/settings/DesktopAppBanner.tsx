import { useState } from 'react';
import { Alert, AlertTitle, Button, Snackbar, Stack, Typography } from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { updateSetting } from '@/store/settingsSlice';

/** Returns true when running inside the Electron shell (window.api is injected by the preload). */
const isElectronApp = (): boolean => typeof window !== 'undefined' && !!(window as { api?: unknown }).api;

/** Detect the user's OS to offer the right installer. */
const detectOs = (): 'windows' | 'unknown' => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) return 'windows';
  return 'unknown';
};

/** Path relative to the web root where the installer lives. */
const INSTALLER_URL_WINDOWS = '/app/presenter-setup.exe';

/**
 * Shows a dismissable alert/banner prompting the user to download the native
 * desktop app. Only shown in a browser context (never inside Electron).
 * The dismissed state is persisted to localStorage via the settings slice.
 */
export const DesktopAppBanner = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const dismissed = useAppSelector((s) => s.settings.desktopAppDismissed);
  const [hintOpen, setHintOpen] = useState(false);

  // Never show inside the Electron app
  if (isElectronApp()) return null;
  if (dismissed) return null;

  const os = detectOs();
  // Only show banner if we have an installer for this OS
  if (os === 'unknown') return null;

  const handleDismiss = () => {
    dispatch(updateSetting({ key: 'desktopAppDismissed', value: true }));
    setHintOpen(true);
  };

  const handleDownload = () => {
    const url = os === 'windows' ? INSTALLER_URL_WINDOWS : INSTALLER_URL_WINDOWS;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  };

  return (
    <>
      <Alert
        severity="info"
        sx={{ borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}
        action={
          <Stack direction="row" gap={1} alignItems="center">
            <Button size="small" startIcon={<DownloadIcon />} variant="contained" onClick={handleDownload}>
              {os === 'windows' ? LL.DESKTOP_APP.DOWNLOAD_WINDOWS() : LL.DESKTOP_APP.DOWNLOAD_WINDOWS()}
            </Button>
            <Button size="small" onClick={handleDismiss} color="inherit">
              {LL.DESKTOP_APP.DISMISS()}
            </Button>
          </Stack>
        }
      >
        <AlertTitle>{LL.DESKTOP_APP.BANNER_TITLE()}</AlertTitle>
        <Typography variant="body2">{LL.DESKTOP_APP.BANNER_BODY()}</Typography>
      </Alert>

      {/* Hint snackbar after dismissal */}
      <Snackbar
        open={hintOpen}
        autoHideDuration={6000}
        onClose={() => setHintOpen(false)}
        message={LL.DESKTOP_APP.DISMISS_HINT()}
      />
    </>
  );
};

