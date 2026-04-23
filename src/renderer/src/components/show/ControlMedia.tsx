import { useMemo, memo } from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { Image as ImageIcon, Videocam as VideocamIcon, Palette as PaletteIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import VideoControlBar from '@/components/media/VideoControlBar';
import { resolveMediaUrl } from '@/utils/mediaUrl';

interface ControlMediaProps {
  item: ShowItem;
}

const ControlMedia = ({ item }: ControlMediaProps) => {
  const { LL } = useI18nContext();
  const resolvedPath = resolveMediaUrl(item.mediaPath);
  const videoSources = useMemo(() => (resolvedPath ? [resolvedPath] : []), [resolvedPath]);

  const renderContent = () => {
    switch (item.mediaSubType) {
      case 'color':
        return (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <Box
              sx={{
                width: 200,
                height: 200,
                borderRadius: 2,
                backgroundColor: item.mediaColor || '#000000',
                border: 2,
                borderColor: 'divider',
                boxShadow: 3,
              }}
            />
            <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
              {item.mediaColor || '#000000'}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <PaletteIcon color="warning" />
              <Typography color="text.secondary">{LL.MEDIA.COLOR()}</Typography>
            </Stack>
          </Stack>
        );

      case 'video':
        return (
          <Stack alignItems="center" spacing={2}>
            {resolvedPath ? (
              <Box
                component="video"
                src={resolvedPath}
                playsInline
                loop
                muted
                autoPlay
                sx={{
                  width: '100%',
                  maxHeight: 400,
                  borderRadius: 1,
                  bgcolor: '#000',
                }}
              />
            ) : (
              <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
                <VideocamIcon sx={{ fontSize: 80, color: 'text.secondary' }} />
                <Typography color="text.secondary">{LL.CONTROL.VIDEO_PLACEHOLDER()}</Typography>
              </Stack>
            )}
            {item.mediaPath && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>
                {item.mediaPath}
              </Typography>
            )}
          </Stack>
        );

      case 'image':
      default:
        return (
          <Stack alignItems="center" spacing={2} sx={{ py: 2 }}>
            {resolvedPath ? (
              <Box
                component="img"
                src={resolvedPath}
                alt={item.label || 'Media'}
                sx={{
                  maxWidth: '100%',
                  maxHeight: 400,
                  objectFit: 'contain',
                  borderRadius: 1,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <ImageIcon sx={{ fontSize: 80, color: 'text.secondary' }} />
            )}
            <Typography variant="h6" color="text.secondary">
              {item.mediaPath || item.label || LL.MEDIA.IMAGE()}
            </Typography>
          </Stack>
        );
    }
  };

  return (
    <Stack
      sx={{
        flexGrow: 1,
        padding: '0 25px 20px',
        overflowY: 'auto',
        userSelect: 'none',
      }}
    >
      <Card sx={{ border: `1px solid #f9a825` }}>
        <CardContent>{renderContent()}</CardContent>
      </Card>

      {item.mediaSubType === 'video' && <VideoControlBar variant="general" videoSources={videoSources} showIfNoLocalSources={false} />}
    </Stack>
  );
};

export default memo(ControlMedia);
