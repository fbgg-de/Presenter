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
import {
  useGetViewerTokenQuery,
  useGenerateViewerTokenMutation,
  useRevokeViewerTokenMutation,
} from '@/api/viewer.api';
import { useGetSessionQuery } from '@/api/session.api';
import { getBackendBaseUrl } from '@/api/base.api';
import { useGetSettings } from '@/store/settingsSlice';

/** Build the viewer URL from the backend base URL and a token */
function buildViewerUrl(token: string): string {
  const base = getBackendBaseUrl();
  const root = base ? `${base}/` : `${window.location.origin}/`;
  return `${root}viewer.php?token=${token}`;
}

export const ViewerTokenSection = () => {
  const { offlineMode } = useGetSettings();
  const { data: session } = useGetSessionQuery(undefined, { skip: offlineMode });
  const isAuthenticated = !offlineMode && session?.isAuthenticated === true;

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

  const handleGenerate = async () => {
    try {
      const result = await generateToken().unwrap();
      setNewTokenDialog({ open: true, token: result.token });
      setCopied(false);
    } catch {
      // ignore — RTK Query shows the error via status
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoke the viewer token? Any active viewer pages will lose access immediately.')) return;
    await revokeToken();
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyUrl = (token: string) => {
    navigator.clipboard.writeText(buildViewerUrl(token)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {/* New-token reveal dialog */}
      <Dialog
        open={newTokenDialog.open}
        onClose={() => setNewTokenDialog({ open: false, token: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ViewerIcon fontSize="small" />
          Viewer Token Generated
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Copy this token now — it will <strong>not</strong> be shown again.
          </Alert>
          {newTokenDialog.token && (
            <Stack spacing={2}>
              <TextField
                label="Token"
                value={newTokenDialog.token}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={copied ? 'Copied!' : 'Copy token'}>
                          <IconButton size="small" onClick={() => handleCopyToken(newTokenDialog.token!)}>
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
                label="Viewer URL"
                value={buildViewerUrl(newTokenDialog.token)}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <Stack direction="row">
                          <Tooltip title={copied ? 'Copied!' : 'Copy URL'}>
                            <IconButton size="small" onClick={() => handleCopyUrl(newTokenDialog.token!)}>
                              <CopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Open viewer page">
                            <IconButton
                              size="small"
                              onClick={() => window.open(buildViewerUrl(newTokenDialog.token!), '_blank')}
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
          <Button onClick={() => setNewTokenDialog({ open: false, token: null })}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* Inline section */}
      <Stack spacing={1.5} sx={{ py: 0.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ViewerIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ flex: 1 }}>
            Viewer token
          </Typography>
          {isLoading ? (
            <CircularProgress size={16} />
          ) : tokenInfo?.hasToken ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
              {tokenInfo.tokenPrefix}
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              Not set
            </Typography>
          )}
        </Stack>

        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          Generate a token to enable the standalone&nbsp;
          <code>viewer.php</code> page. The page can be deployed on any subdomain
          and displays the live block text without requiring a login.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={isGenerating ? <CircularProgress size={14} /> : <RegenerateIcon fontSize="small" />}
            onClick={handleGenerate}
            disabled={isGenerating || isRevoking}
          >
            {tokenInfo?.hasToken ? 'Regenerate' : 'Generate'}
          </Button>

          {tokenInfo?.hasToken && (
            <Box>
              <Tooltip title="Revoke token — viewer access will stop immediately">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={isRevoking ? <CircularProgress size={14} /> : <DeleteIcon fontSize="small" />}
                    onClick={handleRevoke}
                    disabled={isGenerating || isRevoking}
                  >
                    Revoke
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


