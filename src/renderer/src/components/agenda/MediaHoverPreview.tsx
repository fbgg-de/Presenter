import type { ReactElement } from 'react';
import { Box, Tooltip } from '@mui/material';
import type { ShowItem } from '@/api/shows.api';
import { BackgroundThumb } from '@/components/look/BackgroundThumb';
import { activeVersionOf, mediaItemDataOf } from '@/media/mediaItem';

/**
 * A picture of an image, video or slideshow entry when its icon is hovered in the agenda. A video
 * plays in it, muted, like in the media browser. Anything else renders its child as it is.
 */
export const MediaHoverPreview = ({ item, children }: { item: ShowItem; children: ReactElement }) => {
  const data = mediaItemDataOf(item);
  const source = data ? activeVersionOf(data).sources[0] : undefined;
  if (!source) return children;
  return (
    <Tooltip
      enterDelay={400}
      placement="right"
      slotProps={{ tooltip: { sx: { p: 0.5, bgcolor: 'background.paper', boxShadow: 3, maxWidth: 'none' } } }}
      title={
        <Box sx={{ width: 220 }}>
          {/* Mounted only while shown, so the video plays from the start on every hover. */}
          <BackgroundThumb data={{ [source.type === 'video' ? 'video' : 'image']: { path: source.path, fit: 'cover' } }} autoPlay />
        </Box>
      }
    >
      {children}
    </Tooltip>
  );
};
