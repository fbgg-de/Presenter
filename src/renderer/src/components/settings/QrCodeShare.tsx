import { useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close as CloseIcon, ContentCopy as CopyIcon, Check as CheckIcon, QrCode2 as QrCodeIcon } from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';

interface QrCodeShareProps {
  open: boolean;
  onClose: () => void;
}

export const QrCodeShare = ({ open, onClose }: QrCodeShareProps) => {
  const { LL } = useI18nContext();
  const { wsPort } = useGetSettings();
  const [copied, setCopied] = useState(false);

  // Build the musician view URL
  const musicianUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/notes`;
  }, []);

  // Build the WebSocket URL
  const wsUrl = useMemo(() => {
    const hostname = window.location.hostname || 'localhost';
    return `ws://${hostname}:${wsPort}`;
  }, [wsPort]);

  // Encode both URLs in the QR code payload
  const qrPayload = useMemo(() => {
    return JSON.stringify({
      url: musicianUrl,
      ws: wsUrl,
    });
  }, [musicianUrl, wsUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(musicianUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const input = document.createElement('input');
      input.value = musicianUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <QrCodeIcon color="primary" />
          <Typography variant="h6">{LL.QR.SHARE_TITLE()}</Typography>
          <Stack flexGrow={1} />
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} alignItems="center" sx={{ py: 2 }}>
          {/* QR Code */}
          <Stack
            sx={{
              p: 3,
              bgcolor: '#FFFFFF',
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
            }}
          >
            <QRCodeSVG value={qrPayload} size={240} level="M" marginSize={4} />
          </Stack>

          <Typography variant="body2" color="text.secondary" textAlign="center">
            {LL.QR.SHARE_DESCRIPTION()}
          </Typography>

          {/* Musician View URL */}
          <Stack spacing={1} sx={{ width: '100%' }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {LL.QR.SHARE_MUSICIAN_URL()}
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                value={musicianUrl}
                size="small"
                fullWidth
                slotProps={{ input: { readOnly: true } }}
                sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
              />
              <Tooltip title={copied ? LL.QR.SHARE_COPIED() : LL.QR.SHARE_COPY_URL()}>
                <IconButton onClick={handleCopyUrl} color={copied ? 'success' : 'default'}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {/* WebSocket URL */}
          <Stack spacing={1} sx={{ width: '100%' }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {LL.QR.SHARE_WS_URL()}
            </Typography>
            <TextField
              value={wsUrl}
              size="small"
              fullWidth
              slotProps={{ input: { readOnly: true } }}
              sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
    </Dialog>
  );
};
