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

interface QrCodeShareProps {
  open: boolean;
  onClose: () => void;
}

export const QrCodeShare = ({ open, onClose }: QrCodeShareProps) => {
  const { LL } = useI18nContext();
  const [copied, setCopied] = useState(false);

  // Build the musician view URL — points directly to the separate musician.html bundle
  const musicianUrl = useMemo(() => {
    const base = window.location.origin;
    return `${base}/notes`;
  }, []);

  // QR code encodes just the musician URL
  const qrPayload = musicianUrl;

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
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
          }}
        >
          <QrCodeIcon color="primary" />
          <Typography variant="h6">{LL.QR.SHARE_TITLE()}</Typography>
          <Stack
            sx={{
              flexGrow: 1,
            }}
          />
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack
          spacing={3}
          sx={{
            alignItems: 'center',
            py: 2,
          }}
        >
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

          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              textAlign: 'center',
            }}
          >
            {LL.QR.SHARE_DESCRIPTION()}
          </Typography>

          {/* Musician View URL */}
          <Stack spacing={1} sx={{ width: '100%' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CLOSE()}</Button>
      </DialogActions>
    </Dialog>
  );
};
