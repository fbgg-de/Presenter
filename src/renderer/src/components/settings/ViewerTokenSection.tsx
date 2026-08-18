import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenIcon,
  Refresh as RegenerateIcon,
  Tv as ViewerIcon,
} from '@mui/icons-material';
import { useGetViewerTokenQuery, useGenerateViewerTokenMutation, useRevokeViewerTokenMutation } from '@/api/viewer.api';
import { useGetSessionQuery } from '@/api/session.api';
import { getBackendBaseUrl } from '@/api/base.api';
import { useGetSettings } from '@/store/settingsSlice';
import { useI18nContext } from '@/i18n/i18n-react';
import { copyTextToClipboard } from '@/utils/clipboard';

/**
 * Build the link to the deployed text viewer for a token.
 *
 * The viewer (`viewer/index.php`) reads the token from the query string and falls back to
 * the one in its own config.php, so a single deployed copy serves both a fixed screen and
 * these per-account links.
 *
 * `viewerUrl` comes from `VIEWER_URL` in config.php because the viewer is commonly hosted
 * on its own subdomain (a display server, an intranet host) and cannot be derived from
 * this app's address. It arrives without a trailing slash. When it is unset we fall back
 * to `<this app>/viewer/`, which is right only when both are served from the same host.
 */
function buildViewerUrl(token: string, viewerUrl?: string | null): string {
  if (viewerUrl) return `${viewerUrl}/?token=${token}`;
  const base = getBackendBaseUrl();
  const root = base ? `${base}/` : `${window.location.origin}/`;
  return `${root}viewer/?token=${token}`;
}

export const ViewerTokenSection = () => {
  const { LL } = useI18nContext();
  const { offlineMode } = useGetSettings();
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const isAuthenticated = !offlineMode && session?.isAuthenticated === true;
  const viewerUrl = session?.settings?.viewerUrl;

  const { data: tokenInfo, isLoading } = useGetViewerTokenQuery(undefined, {
    skip: !isAuthenticated,
  });
  const [generateToken, { isLoading: isGenerating }] = useGenerateViewerTokenMutation();
  const [revokeToken, { isLoading: isRevoking }] = useRevokeViewerTokenMutation();

  // Dialog to show the new token once after generation
  const [newTokenDialog, setNewTokenDialog] = useState<{ open: boolean; token: string | null }>({
    open: false,
    token: null,
  });
  const [copied, setCopied] = useState(false);
  /** Set when the clipboard was unavailable — the user must select the text manually. */
  const [copyFailed, setCopyFailed] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);

  const handleGenerate = async () => {
    try {
      const result = await generateToken().unwrap();
      setNewTokenDialog({ open: true, token: result.token });
      setCopied(false);
      setCopyFailed(false);
    } catch {
      // ignore — RTK Query shows the error via status
    }
  };

  const handleRevoke = async () => {
    setRevokeConfirm(false);
    await revokeToken();
  };

  /** Copy and report the ACTUAL result — a plain-HTTP deployment has no clipboard API. */
  const handleCopy = async (text: string) => {
    const ok = await copyTextToClipboard(text);
    setCopied(ok);
    setCopyFailed(!ok);
    setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 2000);
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {/* New-token reveal dialog */}
      <Dialog open={newTokenDialog.open} onClose={() => setNewTokenDialog({ open: false, token: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ViewerIcon fontSize="small" />
          {LL.VIEWER_TOKEN.GENERATED_TITLE()}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {LL.VIEWER_TOKEN.GENERATED_WARNING()}
          </Alert>
          {copyFailed && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {LL.VIEWER_TOKEN.COPY_FAILED()}
            </Alert>
          )}
          {newTokenDialog.token && (
            <Stack spacing={2}>
              <TextField
                label={LL.VIEWER_TOKEN.TOKEN()}
                value={newTokenDialog.token}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={copied ? LL.VIEWER_TOKEN.COPIED() : LL.VIEWER_TOKEN.COPY_TOKEN()}>
                          <IconButton size="small" onClick={() => handleCopy(newTokenDialog.token!)}>
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  },
                }}
                size="small"
                fullWidth
                sx={{ fontFamily: 'monospace' }}
              />
              <TextField
                label={LL.VIEWER_TOKEN.VIEWER_URL()}
                value={buildViewerUrl(newTokenDialog.token, viewerUrl)}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <Stack direction="row">
                          <Tooltip title={copied ? LL.VIEWER_TOKEN.COPIED() : LL.VIEWER_TOKEN.COPY_URL()}>
                            <IconButton size="small" onClick={() => handleCopy(buildViewerUrl(newTokenDialog.token!, viewerUrl))}>
                              <CopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={LL.VIEWER_TOKEN.OPEN_VIEWER()}>
                            <IconButton
                              size="small"
                              onClick={() => window.open(buildViewerUrl(newTokenDialog.token!, viewerUrl), '_blank')}
                            >
                              <OpenIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </InputAdornment>
                    ),
                  },
                }}
                size="small"
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewTokenDialog({ open: false, token: null })}>{LL.COMMON.DONE()}</Button>
        </DialogActions>
      </Dialog>

      {/* Revoking cuts off every viewer page instantly, so it gets a real confirmation
          dialog rather than the browser's native confirm() the rest of the app never uses. */}
      <Dialog open={revokeConfirm} onClose={() => setRevokeConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{LL.VIEWER_TOKEN.REVOKE()}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{LL.VIEWER_TOKEN.REVOKE_CONFIRM()}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeConfirm(false)}>{LL.COMMON.CANCEL()}</Button>
          <Button variant="contained" color="error" onClick={handleRevoke}>
            {LL.VIEWER_TOKEN.REVOKE()}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inline section */}
      <Stack spacing={1.5} sx={{ py: 0.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ViewerIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {LL.VIEWER_TOKEN.TITLE()}
          </Typography>
          {isLoading ? (
            <CircularProgress size={16} />
          ) : tokenInfo?.hasToken ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
              {tokenInfo.tokenPrefix}
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {LL.VIEWER_TOKEN.NOT_SET()}
            </Typography>
          )}
        </Stack>

        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          {LL.VIEWER_TOKEN.DESCRIPTION()}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={isGenerating ? <CircularProgress size={14} /> : <RegenerateIcon fontSize="small" />}
            onClick={handleGenerate}
            disabled={isGenerating || isRevoking}
          >
            {tokenInfo?.hasToken ? LL.VIEWER_TOKEN.REGENERATE() : LL.VIEWER_TOKEN.GENERATE()}
          </Button>

          {tokenInfo?.hasToken && (
            <Box>
              <Tooltip title={LL.VIEWER_TOKEN.REVOKE_HINT()}>
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={isRevoking ? <CircularProgress size={14} /> : <DeleteIcon fontSize="small" />}
                    onClick={() => setRevokeConfirm(true)}
                    disabled={isGenerating || isRevoking}
                  >
                    {LL.VIEWER_TOKEN.REVOKE()}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          )}
        </Stack>
      </Stack>
    </>
  );
};
