import { useState, ReactNode, useCallback } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import {
  Download as DownloadIcon,
  CheckCircle as CheckIcon,
  Apple as MacIcon,
  Window as WindowsIcon,
  Terminal as LinuxIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useUpdateSetting, useGetSettings } from '@/store/settingsSlice';
import { DetectedOs, detectOs, formatFileSize, isElectronApp } from '@/utils';
import { useGetInstallersQuery, type Installer } from '@/api/installers.api';

interface OsCardProps {
  label: string;
  icon: ReactNode;
  isCurrent: boolean;
  /** The installer the server has for this system; undefined when it has none. */
  installer?: Installer;
  /** The server has not said yet which installers it has. */
  loading?: boolean;
  unavailableLabel: string;
  downloadLabel: string;
  /** The badge on the card of the system this browser runs on. */
  yourOsLabel: string;
}

/** Compact vertical OS card for the download modal row. */
const OsCard = ({ label, icon, isCurrent, installer, loading, unavailableLabel, downloadLabel, yourOsLabel }: OsCardProps) => (
  <Stack
    spacing={1}
    // Gap, not margins: the absolutely placed "Your OS" badge would otherwise count as the first
    // child and push the card's icon down, out of line with the other cards.
    useFlexGap
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
        label={yourOsLabel}
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
    {loading ? (
      <Skeleton variant="rounded" sx={{ width: '100%', height: 30 }} />
    ) : installer ? (
      <>
        <Button
          size="small"
          variant={isCurrent ? 'contained' : 'outlined'}
          startIcon={<DownloadIcon />}
          href={installer.url}
          download
          fullWidth
        >
          {downloadLabel}
        </Button>
        {/* How big, and from when — an old upload shows at a glance. */}
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          {formatFileSize(installer.size)} · {new Date(installer.modified).toLocaleDateString()}
        </Typography>
      </>
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
  // What the server has in /app, asked each time the dialog opens: an upload shows without a reload.
  const { data, isFetching } = useGetInstallersQuery(undefined, { skip: !open, refetchOnMountOrArgChange: true });
  const installerOf = (o: DetectedOs) => data?.installers.find((installer) => installer.os === o);

  const osLabel = (o: DetectedOs) => {
    switch (o) {
      case 'windows':
        return LL.DESKTOP_APP.OS_WINDOWS();
      case 'macos':
        return LL.DESKTOP_APP.OS_MACOS();
      case 'linux':
        return LL.DESKTOP_APP.OS_LINUX();
      default:
        return o;
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
              installer={installerOf('windows')}
              loading={isFetching && !data}
              unavailableLabel={LL.DESKTOP_APP.MODAL_UNAVAILABLE()}
              yourOsLabel={LL.DESKTOP_APP.YOUR_OS()}
              downloadLabel={LL.DESKTOP_APP.DOWNLOAD_WINDOWS()}
            />
            <OsCard
              label={LL.DESKTOP_APP.OS_MACOS()}
              icon={<MacIcon color={os === 'macos' ? 'primary' : 'action'} sx={{ fontSize: 36 }} />}
              isCurrent={os === 'macos'}
              installer={installerOf('macos')}
              loading={isFetching && !data}
              unavailableLabel={LL.DESKTOP_APP.MODAL_UNAVAILABLE()}
              yourOsLabel={LL.DESKTOP_APP.YOUR_OS()}
              downloadLabel={LL.DESKTOP_APP.DOWNLOAD_MACOS()}
            />
            <OsCard
              label={LL.DESKTOP_APP.OS_LINUX()}
              icon={<LinuxIcon color={os === 'linux' ? 'primary' : 'action'} sx={{ fontSize: 36 }} />}
              isCurrent={os === 'linux'}
              installer={installerOf('linux')}
              loading={isFetching && !data}
              unavailableLabel={LL.DESKTOP_APP.MODAL_UNAVAILABLE()}
              yourOsLabel={LL.DESKTOP_APP.YOUR_OS()}
              downloadLabel={LL.DESKTOP_APP.DOWNLOAD_LINUX()}
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
  const { desktopAppDismissed } = useGetSettings('desktopAppDismissed');
  const updateSetting = useUpdateSetting();

  const [modalOpen, setModalOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  // Declared above the early returns below: dismissing sets `desktopAppDismissed`, so the
  // very next render bails out early — and a hook after that point would make the hook
  // count drop between renders, which React rejects ("Rendered fewer hooks than expected")
  // and which took the banner's whole subtree down through the error boundary.
  const handleDismiss = useCallback(() => {
    updateSetting('desktopAppDismissed', true);
    setHintOpen(true);
    setModalOpen(false);
  }, [updateSetting]);

  if (isElectronApp()) {
    return null;
  }
  if (desktopAppDismissed) {
    return null;
  }

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
