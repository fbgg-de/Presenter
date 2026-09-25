/**
 * Setting up Bitfocus Companion: the Presenter module (companion-modules/presenter) connects to
 * the desktop app's WebSocket server, so all the operator needs is where that server listens.
 * The module brings its own actions, feedbacks and presets — no JSON to copy by hand any more.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { ContentCopy as CopyIcon, Close as CloseIcon, Cable as CableIcon, WifiTethering as WifiTetheringIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { copyTextToClipboard } from '@/utils/clipboard';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';

export const CompanionHelper = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { LL } = useI18nContext();
  const C = LL.COMPANION;
  const { companionCommandsEnabled } = useGetSettings('companionCommandsEnabled');
  const updateSetting = useUpdateSetting();

  const [hosts, setHosts] = useState<string[]>([]);
  const [port, setPort] = useState<number | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [latestCommand, setLatestCommand] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    void window.api
      ?.getWsServerInfo?.()
      .then((info) => {
        if (disposed || !info) return;
        setHosts(info.hosts || []);
        setPort(info.port);
        setClientCount(info.clientCount);
        if (typeof info.commandHandlingEnabled === 'boolean') updateSetting('companionCommandsEnabled', info.commandHandlingEnabled);
      })
      .catch(() => undefined);
    const offCount = window.api?.onWsClientCount?.((data) => {
      if (typeof data?.count === 'number') setClientCount(data.count);
    });
    const offCommand = window.api?.onWsLastCommand?.((data) => setLatestCommand(data.action));
    return () => {
      disposed = true;
      if (typeof offCount === 'function') offCount();
      if (typeof offCommand === 'function') offCommand();
    };
  }, [open, updateSetting]);

  useEffect(() => () => clearTimeout(copiedTimer.current ?? undefined), []);

  const copy = async (text: string) => {
    if (!(await copyTextToClipboard(text))) return;
    setCopied(text);
    clearTimeout(copiedTimer.current ?? undefined);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const toggleEnabled = async (enabled: boolean) => {
    updateSetting('companionCommandsEnabled', enabled);
    try {
      await window.api?.setWsCommandHandlingEnabled?.(enabled);
    } catch {
      // Browser build: no server, only the setting.
    }
  };

  const hasServer = port != null && hosts.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CableIcon />
            <Typography variant="h6">{C.HELPER_TITLE()}</Typography>
          </Stack>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <FormControlLabel
              sx={{ m: 0 }}
              control={<Switch size="small" checked={companionCommandsEnabled} onChange={(_, checked) => void toggleEnabled(checked)} />}
              label={<Typography variant="body2">{C.ENABLED()}</Typography>}
            />
            <Tooltip title={C.CONNECTIONS({ count: clientCount })}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <WifiTetheringIcon fontSize="small" color={clientCount > 0 ? 'success' : 'disabled'} />
                <Typography variant="body2" color={clientCount > 0 ? 'success.main' : 'text.disabled'}>
                  {clientCount}
                </Typography>
              </Stack>
            </Tooltip>
          </Stack>

          <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 } }}>
            <Typography component="li" variant="body2">
              {C.SETUP_1()}
            </Typography>
            <Typography component="li" variant="body2">
              {C.SETUP_2()}
            </Typography>
            <Typography component="li" variant="body2">
              {C.SETUP_3()}
            </Typography>
          </Box>

          {hasServer ? (
            <Stack spacing={0.5}>
              {hosts.map((host) => (
                <Stack key={host} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1 }}>
                    {C.HOST()}: {host} · {C.PORT()}: {port}
                  </Typography>
                  <Tooltip title={copied === host ? C.COPIED() : C.COPY()}>
                    <IconButton size="small" onClick={() => void copy(host)}>
                      <CopyIcon fontSize="small" color={copied === host ? 'success' : 'inherit'} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {C.SERVER_INFO_UNAVAILABLE()}
            </Typography>
          )}

          {latestCommand && (
            <Typography variant="caption" color="text.secondary">
              {C.LATEST_COMMAND()}:{' '}
              <Box component="span" sx={{ fontFamily: 'monospace' }}>
                {latestCommand}
              </Box>
            </Typography>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
