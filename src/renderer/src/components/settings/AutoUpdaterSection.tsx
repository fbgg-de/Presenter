import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material';
import { SystemUpdateAlt as UpdateIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { isElectronApp } from '@/utils';

type UpdaterState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error';

interface UpdateInfo {
  version?: string;
  releaseDate?: string;
}

export const AutoUpdaterSection = () => {
  const { LL } = useI18nContext();

  const [state, setState] = useState<UpdaterState>('idle');
  const [info, setInfo] = useState<UpdateInfo>({});
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    if (!isElectronApp()) return;
    const api = window.api;
    if (!api) return;

    api.getAppVersion?.().then((v) => setCurrentVersion(v ?? ''));

    const unsubs: Array<(() => void) | void> = [];
    unsubs.push(api.onUpdaterUpdateAvailable?.((i) => { setInfo(i); setState('available'); }));
    unsubs.push(api.onUpdaterUpdateNotAvailable?.(() => setState('not-available')));
    unsubs.push(api.onUpdaterDownloadProgress?.((p) => { setDownloadPercent(p.percent); setState('downloading'); }));
    unsubs.push(api.onUpdaterUpdateDownloaded?.((i) => { setInfo(i); setState('ready'); }));
    unsubs.push(api.onUpdaterError?.((e) => { setErrorMsg(e.message); setState('error'); }));

    return () => {
      unsubs.forEach((u) => u?.());
    };
  }, []);

  if (!isElectronApp()) return null;

  const api = window.api;

  const handleCheck = async () => {
    setState('checking');
    setErrorMsg('');
    try {
      await api?.checkForUpdates?.();
      setTimeout(() => setState((s) => s === 'checking' ? 'not-available' : s), 15000);
    } catch {
      setState('error');
      setErrorMsg(LL.UPDATER.CHECK_FAILED());
    }
  };

  const handleInstall = () => {
    api?.installUpdate?.();
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <UpdateIcon fontSize="small" color="action" />
        <Typography variant="subtitle2">{LL.UPDATER.TITLE()}</Typography>
        {currentVersion && (
          <Typography variant="caption" color="text.secondary">
            v{currentVersion}
          </Typography>
        )}
      </Stack>

      {state === 'idle' && (
        <Button size="small" variant="outlined" startIcon={<UpdateIcon />} onClick={handleCheck}>
          {LL.UPDATER.CHECK_NOW()}
        </Button>
      )}

      {state === 'checking' && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress size={16} />
          <Typography variant="body2">{LL.UPDATER.CHECKING()}</Typography>
        </Stack>
      )}

      {state === 'not-available' && (
        <Stack spacing={1}>
          <Alert severity="success" icon={<CheckCircleIcon fontSize="small" />} sx={{ py: 0 }}>
            {LL.UPDATER.UP_TO_DATE()}
          </Alert>
          <Button size="small" variant="text" onClick={handleCheck}>
            {LL.UPDATER.CHECK_AGAIN()}
          </Button>
        </Stack>
      )}

      {state === 'available' && (
        <Alert severity="info" sx={{ py: 0 }}>
          {LL.UPDATER.UPDATE_AVAILABLE({ version: info.version ?? '' })}
          {' '}
          {LL.UPDATER.DOWNLOADING_SOON()}
        </Alert>
      )}

      {state === 'downloading' && (
        <Stack spacing={0.5}>
          <Typography variant="body2">{LL.UPDATER.DOWNLOADING({ percent: downloadPercent })}</Typography>
          <Box sx={{ width: '100%' }}>
            <LinearProgress variant="determinate" value={downloadPercent} />
          </Box>
        </Stack>
      )}

      {state === 'ready' && (
        <Stack spacing={1}>
          <Alert severity="success" sx={{ py: 0 }}>
            {LL.UPDATER.READY_TO_INSTALL({ version: info.version ?? '' })}
          </Alert>
          <Button size="small" variant="contained" color="success" startIcon={<UpdateIcon />} onClick={handleInstall}>
            {LL.UPDATER.INSTALL_AND_RESTART()}
          </Button>
        </Stack>
      )}

      {state === 'error' && (
        <Stack spacing={1}>
          <Alert severity="error" sx={{ py: 0 }}>
            {errorMsg || LL.UPDATER.ERROR()}
          </Alert>
          <Button size="small" variant="text" onClick={handleCheck}>
            {LL.UPDATER.CHECK_AGAIN()}
          </Button>
        </Stack>
      )}
    </Stack>
  );
};



