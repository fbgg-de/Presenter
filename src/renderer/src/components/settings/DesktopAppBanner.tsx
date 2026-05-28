import { useState, ReactNode, useCallback } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Stack, Typography } from '@mui/material';
import {
  Download as DownloadIcon,
  CheckCircle as CheckIcon,
  Apple as MacIcon,
  Window as WindowsIcon,
  Terminal as LinuxIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useUpdateSetting, useGetSettings } from '@/store/settingsSlice';
import { DetectedOs, detectOs, isElectronApp } from '@/utils';

/** Path relative to the web root where the installer lives. */
const INSTALLER_URLS: Record<DetectedOs, string | null> = {
  windows: '/app/presenter-setup.exe',
  macos: null, // not yet available
  linux: null, // not yet available
  unknown: null,
};

interface OsCardProps {
  label: string;
  icon: ReactNode;
  isCurrent: boolean;
  url: string | null;
  unavailableLabel: string;
  downloadLabel: string;
}

/** Compact vertical OS card for the download modal row. */
const OsCard = ({ label, icon, isCurrent, url, unavailableLabel, downloadLabel }: OsCardProps) => (
  <Stack
    spacing={1}
    sx={{
      alignItems: 'center',
      flex: 1,
      p: 1.5,
      borderRadius: 2,
      border: 2,
      borderColor: isCurrent ? 'primary.main' : 'divider',
      bgcolor: isCurrent ? 'action.selected' : 'transparent',
      position: 'relative',
    }}
  >
    {isCurrent && (
      <Chip
        size="small"
        icon={<CheckIcon />}
        label="Your OS"
        color="primary"
        variant="filled"
        sx={{ position: 'absolute', top: -12, fontSize: '0.65rem', height: 20 }}
      />
    )}
    {icon}
    <Typography
      variant="body2"
      sx={{
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      {label}
    </Typography>
    {url ? (
      <Button size="small" variant={isCurrent ? 'contained' : 'outlined'} startIcon={<DownloadIcon />} href={url} download fullWidth>
        {downloadLabel}
      </Button>
    ) : (
      <Typography
        variant="caption"
        sx={{
          color: 'text.disabled',
          textAlign: 'center',
        }}
      >
        {unavailableLabel}
      </Typography>
    )}
  </Stack>
);

interface DesktopAppDownloadModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional dismiss handler — shows dismiss button and snackbar hint */
  onDismiss?: () => void;
}

/**
 * Standalone download modal that can be opened from anywhere (e.g. Settings).
 * Exported so it can be reused without the banner.
 */
export const DesktopAppDownloadModal = ({ open, onClose, onDismiss }: DesktopAppDownloadModalProps) => {
  const { LL } = useI18nContext();
  const os = detectOs();

  const osLabel = (o: DetectedOs) => {
    switch (o) {
      case 'windows': return LL.DESKTOP_APP.OS_WINDOWS();
      case 'macos': return LL.DESKTOP_APP.OS_MACOS();
      case 'linux': return LL.DESKTOP_APP.OS_LINUX();
      default: return o;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{LL.DESKTOP_APP.MODAL_TITLE()}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {LL.DESKTOP_APP.MODAL_BODY()}
          </Typography>
          {os !== 'unknown' && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {LL.DESKTOP_APP.MODAL_DETECT_HINT({ os: osLabel(os) })}
            </Typography>
          )}
          <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
            <OsCard
              label={LL.DESKTOP_APP.OS_WINDOWS()}
              icon={<WindowsIcon color={os === 'windows' ? 'primary' : 'action'} sx={{ fontSize: 36 }} />}
              isCurrent={os === 'windows'}
              url={INSTALLER_URLS.windows}
              unavailableLabel={LL.DESKTOP_APP.MODAL_UNAVAILABLE()}
              downloadLabel={LL.DESKTOP_APP.DOWNLOAD_WINDOWS()}
            />
            <OsCard
              label={LL.DESKTOP_APP.OS_MACOS()}
              icon={<MacIcon color={os === 'macos' ? 'primary' : 'action'} sx={{ fontSize: 36 }} />}
              isCurrent={os === 'macos'}
              url={INSTALLER_URLS.macos}
              unavailableLabel={LL.DESKTOP_APP.MODAL_UNAVAILABLE()}
              downloadLabel={LL.DESKTOP_APP.DOWNLOAD_WINDOWS()}
            />
            <OsCard
              label={LL.DESKTOP_APP.OS_LINUX()}
              icon={<LinuxIcon color={os === 'linux' ? 'primary' : 'action'} sx={{ fontSize: 36 }} />}
              isCurrent={os === 'linux'}
              url={INSTALLER_URLS.linux}
              unavailableLabel={LL.DESKTOP_APP.MODAL_UNAVAILABLE()}
              downloadLabel={LL.DESKTOP_APP.DOWNLOAD_WINDOWS()}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        {onDismiss && (
          <Button onClick={onDismiss} color="inherit">
            {LL.DESKTOP_APP.DISMISS()}
          </Button>
        )}
        <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Shows a compact dismissable alert/banner prompting the user to open the download modal.
 * Only shown in a browser context (never inside Electron).
 */
export const DesktopAppBanner = () => {
  const { LL } = useI18nContext();
  const { desktopAppDismissed } = useGetSettings();
  const updateSetting = useUpdateSetting();

  const [modalOpen, setModalOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  if (isElectronApp()) {
    return null;
  }
  if (desktopAppDismissed) {
    return null;
  }

  const handleDismiss = useCallback(() => {
    updateSetting('desktopAppDismissed', true);
    setHintOpen(true);
    setModalOpen(false);
  }, [updateSetting]);

  return (
    <>
      {/* Compact banner — no download button, just prompt + modal opener */}
      <Alert
        severity="info"
        sx={{ borderRadius: 0, borderBottom: 1, borderColor: 'divider', py: 0.5 }}
        action={
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
            <Button size="small" variant="outlined" onClick={() => setModalOpen(true)}>
              {LL.DESKTOP_APP.MODAL_MORE_OPTIONS()}
            </Button>
            <Button size="small" onClick={handleDismiss} color="inherit">
              {LL.DESKTOP_APP.DISMISS()}
            </Button>
          </Stack>
        }
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {LL.DESKTOP_APP.BANNER_TITLE()}
        </Typography>
      </Alert>
      <DesktopAppDownloadModal open={modalOpen} onClose={() => setModalOpen(false)} onDismiss={handleDismiss} />
      {/* Hint snackbar after dismissal */}
      <Snackbar open={hintOpen} autoHideDuration={6000} onClose={() => setHintOpen(false)} message={LL.DESKTOP_APP.DISMISS_HINT()} />
    </>
  );
};
